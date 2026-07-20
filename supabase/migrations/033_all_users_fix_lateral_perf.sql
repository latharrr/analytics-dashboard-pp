-- Real fix for analytics_all_users_detail() timing out (migration 031;
-- the indexes in 032 were necessary but not sufficient).
--
-- The per-page LATERAL that finds each user's most recent activity was
-- querying the dedup.* VIEWS (dedup.chat_messages, dedup.trust_ledger,
-- etc.). Each of those is `SELECT DISTINCT ON (id) * FROM public.<t>
-- ORDER BY id` — so Postgres must sort the ENTIRE table by id before it
-- can apply the `sender_id = <user>` filter, which defeats the
-- (sender_id, created_at) index added in 032 entirely. That full
-- DISTINCT-ON sort was then re-run once per page row per table
-- (50 rows x 7 tables), hence the statement timeout.
--
-- Fix: point the LATERAL at the public.* base tables directly, where the
-- filter columns ARE indexed (migration 032). Deduplication doesn't
-- matter here: the subquery only keeps the single most-recent event
-- (ORDER BY occurred_at DESC LIMIT 1), so a duplicated snapshot of that
-- event just appears 2-3x among the candidates and LIMIT 1 collapses it
-- to the same row — identical result, but now an index lookup returning
-- a handful of rows instead of a full-table sort.
--
-- dedup.users is still used for the `filtered`/`ranked` CTEs (one scan
-- per query, not per row — and now index-backed by 032's
-- idx_users_id_updated_at), so the user list itself stays deduplicated
-- and total_count stays correct.
--
-- Return signature is unchanged, so CREATE OR REPLACE is fine.

-- One index 032 missed: the pools-by-id join inside the LATERAL
-- ("Joined a pool" and "Flatmate listing" both join pools on id).
CREATE INDEX IF NOT EXISTS idx_pools_id ON public.pools (id);

CREATE OR REPLACE FUNCTION analytics_all_users_detail(
  search_text text DEFAULT NULL,
  signed_up_from timestamptz DEFAULT NULL,
  signed_up_to timestamptz DEFAULT NULL,
  last_active_from timestamptz DEFAULT NULL,
  last_active_to timestamptz DEFAULT NULL,
  sort_by text DEFAULT 'last_active',
  sort_dir text DEFAULT 'desc',
  page_number int DEFAULT 1,
  page_size int DEFAULT 50
)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  phone text,
  signed_up_at timestamptz,
  last_active_at timestamptz,
  trust_score numeric,
  is_verified boolean,
  is_banned boolean,
  last_activity_type text,
  last_activity_detail text,
  last_activity_occurred_at timestamptz,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    SELECT
      GREATEST(page_number, 1) AS pg_num,
      LEAST(GREATEST(page_size, 1), 200) AS pg_size
  ),
  filtered AS (
    SELECT u.*, count(*) OVER ()::bigint AS total_count
    FROM dedup.users u
    WHERE u.is_bot = false
      AND (search_text IS NULL OR u.name ILIKE '%' || search_text || '%' OR u.phone ILIKE '%' || search_text || '%')
      AND (signed_up_from IS NULL OR u.created_at >= signed_up_from)
      AND (signed_up_to IS NULL OR u.created_at <= signed_up_to)
      AND (last_active_from IS NULL OR u.last_activity >= last_active_from)
      AND (last_active_to IS NULL OR u.last_activity <= last_active_to)
  ),
  ranked AS (
    SELECT
      f.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN sort_by = 'last_active' AND sort_dir = 'asc' THEN f.last_activity END ASC NULLS LAST,
          CASE WHEN sort_by = 'last_active' AND sort_dir = 'desc' THEN f.last_activity END DESC NULLS LAST,
          CASE WHEN sort_by = 'signed_up' AND sort_dir = 'asc' THEN f.created_at END ASC NULLS LAST,
          CASE WHEN sort_by = 'signed_up' AND sort_dir = 'desc' THEN f.created_at END DESC NULLS LAST,
          CASE WHEN sort_by = 'name' AND sort_dir = 'asc' THEN f.name END ASC NULLS LAST,
          CASE WHEN sort_by = 'name' AND sort_dir = 'desc' THEN f.name END DESC NULLS LAST,
          CASE WHEN sort_by = 'trust_score' AND sort_dir = 'asc' THEN f.trust_score END ASC NULLS LAST,
          CASE WHEN sort_by = 'trust_score' AND sort_dir = 'desc' THEN f.trust_score END DESC NULLS LAST,
          f.last_activity DESC NULLS LAST
      ) AS rn
    FROM filtered f
  ),
  page AS (
    SELECT r.*
    FROM ranked r, bounds b
    WHERE r.rn > (b.pg_num - 1) * b.pg_size
      AND r.rn <= b.pg_num * b.pg_size
  )
  SELECT
    pu.id,
    pu.name,
    pu.phone,
    pu.created_at,
    pu.last_activity,
    pu.trust_score,
    pu.is_verified,
    pu.is_banned,
    la.activity_type,
    la.detail,
    la.occurred_at,
    pu.total_count
  FROM page pu
  LEFT JOIN LATERAL (
    SELECT e.activity_type, e.detail, e.occurred_at
    FROM (
      SELECT 'Chat message'::text AS activity_type, cm.type::text AS detail, cm.created_at AS occurred_at
      FROM public.chat_messages cm WHERE cm.sender_id = pu.id
      UNION ALL
      SELECT 'Trust action', tl.reason, tl.created_at
      FROM public.trust_ledger tl WHERE tl.user_id = pu.id
      UNION ALL
      SELECT 'Joined a pool', jp.category, jpp.joined_at
      FROM public.pool_participants jpp
      JOIN public.pools jp ON jp.id = jpp.pool_id
      WHERE jpp.user_id = pu.id
      UNION ALL
      SELECT 'Created a pool', cp.category, cp.created_at
      FROM public.pools cp WHERE cp.creator_id = pu.id
      UNION ALL
      SELECT 'PG search', concat_ws(
        ' · ',
        'Budget: ' || COALESCE(phq.budget_range, phq.max_budget::text),
        'Landing: ' || phq.landing_time
      ), phq.created_at
      FROM public.pg_hunt_queries phq WHERE phq.user_id = pu.id
      UNION ALL
      SELECT 'Flat listing', NULLIF(pf.bhk_type, ''), pf.created_at
      FROM public.pool_flat pf WHERE pf.created_by = pu.id
      UNION ALL
      SELECT 'Flatmate listing', 'City: ' || COALESCE(pfm.city, 'n/a'), pfm.created_at
      FROM public.pools fp
      JOIN public.pool_flatmate pfm ON pfm.pool_id = fp.id
      WHERE fp.creator_id = pu.id
    ) e
    ORDER BY e.occurred_at DESC NULLS LAST
    LIMIT 1
  ) la ON true
  ORDER BY pu.rn;
$$;

GRANT EXECUTE ON FUNCTION analytics_all_users_detail(
  text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, int, int
) TO service_role;
