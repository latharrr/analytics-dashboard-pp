-- "All Users" directory: every (non-bot) user in the app, with their
-- signup date ("installed" — same convention as migration 026/028: no
-- separate app-download/install event exists in this data, so
-- users.created_at is used), last visit (users.last_activity, maintained
-- by the app itself — not computed from any of our event tables), and
-- their single most recent tracked activity (chat, trust action, pool
-- joined/created, PG search, Flat/Flatmate listing — same signal sources
-- as analytics_new_user_activity_detail, migration 030).
--
-- Unlike the other "detail" functions in this codebase (PG/Flat Leads,
-- Verified Users, New User Locations), this covers the *entire* user
-- base rather than a small cohort/lead-list, so it's genuinely paginated
-- (page_number/page_size, capped at 200/page) rather than just a capped
-- top-N list.
--
-- The `last_activity_*` columns are computed via a LATERAL join scanning
-- each signal table filtered to one user at a time — safe here because
-- it only runs against the current page's rows (bounded by page_size),
-- never the full table.
--
-- Sorting is a fixed, whitelisted set of columns (not a raw column name)
-- to keep this a plain SQL function — no dynamic SQL, so no injection
-- surface.

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
      FROM dedup.chat_messages cm WHERE cm.sender_id = pu.id
      UNION ALL
      SELECT 'Trust action', tl.reason, tl.created_at
      FROM dedup.trust_ledger tl WHERE tl.user_id = pu.id
      UNION ALL
      SELECT 'Joined a pool', jp.category, jpp.joined_at
      FROM dedup.pool_participants jpp
      JOIN dedup.pools jp ON jp.id = jpp.pool_id
      WHERE jpp.user_id = pu.id
      UNION ALL
      SELECT 'Created a pool', cp.category, cp.created_at
      FROM dedup.pools cp WHERE cp.creator_id = pu.id
      UNION ALL
      SELECT 'PG search', concat_ws(
        ' · ',
        'Budget: ' || COALESCE(phq.budget_range, phq.max_budget::text),
        'Landing: ' || phq.landing_time
      ), phq.created_at
      FROM public.pg_hunt_queries phq WHERE phq.user_id = pu.id
      UNION ALL
      SELECT 'Flat listing', NULLIF(pf.bhk_type, ''), pf.created_at
      FROM dedup.pool_flat pf WHERE pf.created_by = pu.id
      UNION ALL
      SELECT 'Flatmate listing', 'City: ' || COALESCE(pfm.city, 'n/a'), pfm.created_at
      FROM dedup.pool_flatmate pfm
      JOIN dedup.pools fp ON fp.id = pfm.pool_id
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
