-- Make inactive users visible everywhere.
--
-- 1) analytics_all_users_detail gains an `activity_filter` (all/active/inactive)
--    based on the already-normalised last_active (034): active = ever active,
--    inactive = never active (last_activity was NULL or a pre-2000 sentinel).
--    Cheap — no extra LATERAL.
--
-- 2) analytics_new_user_activity_by_user previously INNER-joined the cohort to
--    its activity, so new signups who did NOTHING never appeared (of ~650 7-day
--    signups, ~329 were never active — completely hidden). Now it LEFT-joins so
--    inactive cohort users are returned with activity_count = 0 / events = [],
--    orders active users first, and takes the same `activity_filter`.
--
-- Both change arity, so DROP the old signatures before CREATE (avoids PostgREST
-- overload ambiguity).

DROP FUNCTION IF EXISTS analytics_all_users_detail(
  text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, int, int
);

CREATE OR REPLACE FUNCTION analytics_all_users_detail(
  search_text text DEFAULT NULL,
  signed_up_from timestamptz DEFAULT NULL,
  signed_up_to timestamptz DEFAULT NULL,
  last_active_from timestamptz DEFAULT NULL,
  last_active_to timestamptz DEFAULT NULL,
  activity_filter text DEFAULT 'all',
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
  base AS (
    SELECT
      u.id,
      u.name,
      u.phone,
      u.created_at,
      u.trust_score,
      u.is_verified,
      u.is_banned,
      CASE WHEN u.last_activity < '2000-01-01'::timestamptz THEN NULL ELSE u.last_activity END AS last_active
    FROM dedup.users u
    WHERE u.is_bot = false
  ),
  filtered AS (
    SELECT b.*, count(*) OVER ()::bigint AS total_count
    FROM base b
    WHERE (search_text IS NULL OR b.name ILIKE '%' || search_text || '%' OR b.phone ILIKE '%' || search_text || '%')
      AND (signed_up_from IS NULL OR b.created_at >= signed_up_from)
      AND (signed_up_to IS NULL OR b.created_at <= signed_up_to)
      AND (last_active_from IS NULL OR b.last_active >= last_active_from)
      AND (last_active_to IS NULL OR b.last_active <= last_active_to)
      AND (
        activity_filter = 'all'
        OR (activity_filter = 'active' AND b.last_active IS NOT NULL)
        OR (activity_filter = 'inactive' AND b.last_active IS NULL)
      )
  ),
  ranked AS (
    SELECT
      f.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN sort_by = 'last_active' AND sort_dir = 'asc' THEN f.last_active END ASC NULLS LAST,
          CASE WHEN sort_by = 'last_active' AND sort_dir = 'desc' THEN f.last_active END DESC NULLS LAST,
          CASE WHEN sort_by = 'signed_up' AND sort_dir = 'asc' THEN f.created_at END ASC NULLS LAST,
          CASE WHEN sort_by = 'signed_up' AND sort_dir = 'desc' THEN f.created_at END DESC NULLS LAST,
          CASE WHEN sort_by = 'name' AND sort_dir = 'asc' THEN f.name END ASC NULLS LAST,
          CASE WHEN sort_by = 'name' AND sort_dir = 'desc' THEN f.name END DESC NULLS LAST,
          CASE WHEN sort_by = 'trust_score' AND sort_dir = 'asc' THEN f.trust_score END ASC NULLS LAST,
          CASE WHEN sort_by = 'trust_score' AND sort_dir = 'desc' THEN f.trust_score END DESC NULLS LAST,
          f.last_active DESC NULLS LAST
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
    pu.last_active,
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
  text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, int, int
) TO service_role;


-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS analytics_new_user_activity_by_user(int, int);

CREATE OR REPLACE FUNCTION analytics_new_user_activity_by_user(
  days_back int DEFAULT 7,
  user_limit int DEFAULT 500,
  activity_filter text DEFAULT 'all'
)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  phone text,
  signed_up_at timestamptz,
  last_activity_at timestamptz,
  activity_count bigint,
  events jsonb
)
LANGUAGE sql STABLE AS $$
  WITH cohort AS (
    SELECT id, name, phone, created_at FROM dedup.users
    WHERE is_bot = false AND created_at >= now() - (days_back || ' days')::interval
  ),
  activity AS (
    SELECT
      cm.sender_id AS user_id,
      'Chat message'::text AS activity_type,
      cm.created_at AS occurred_at,
      CASE
        WHEN cr.pool_id IS NOT NULL
          THEN 'Pool: ' || COALESCE(NULLIF(p.title, ''), NULLIF(p.category, ''), '(untitled pool)')
        ELSE COALESCE(NULLIF(cr.name, ''), 'Direct message')
      END AS detail
    FROM dedup.chat_messages cm
    JOIN cohort c ON c.id = cm.sender_id
    LEFT JOIN dedup.chat_rooms cr ON cr.id = cm.room_id
    LEFT JOIN dedup.pools p ON p.id = cr.pool_id
    WHERE cm.sender_id IS NOT NULL AND cm.created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT tl.user_id, 'Trust action', tl.created_at, tl.reason
    FROM dedup.trust_ledger tl JOIN cohort c ON c.id = tl.user_id
    WHERE tl.created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT pp.user_id, 'Joined a pool', pp.joined_at,
      'Pool: ' || COALESCE(NULLIF(p.title, ''), NULLIF(p.category, ''), '(untitled pool)')
    FROM dedup.pool_participants pp
    JOIN cohort c ON c.id = pp.user_id
    JOIN dedup.pools p ON p.id = pp.pool_id
    WHERE pp.joined_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT p.creator_id, 'Created a pool', p.created_at,
      'Pool: ' || COALESCE(NULLIF(p.title, ''), NULLIF(p.category, ''), '(untitled pool)')
    FROM dedup.pools p JOIN cohort c ON c.id = p.creator_id
    WHERE p.created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT phq.user_id, 'PG search', phq.created_at, concat_ws(
      ' · ',
      'Budget: ' || COALESCE(phq.budget_range, phq.max_budget::text),
      'Landing: ' || phq.landing_time,
      'Sharing: ' || array_to_string(phq.sharing_pref, ', ')
    )
    -- Dedup pg_hunt_queries inline (no dedup.* view exists for it) so the ~3x
    -- duplicate raw rows don't triple-count PG searches in activity_count and
    -- the events timeline. Date filter inside the subquery is safe — duplicate
    -- snapshots of an id share created_at.
    FROM (
      SELECT DISTINCT ON (id) id, user_id, budget_range, max_budget, landing_time, sharing_pref, created_at
      FROM public.pg_hunt_queries
      WHERE created_at >= now() - (days_back || ' days')::interval
      ORDER BY id
    ) phq JOIN cohort c ON c.id = phq.user_id
    UNION ALL
    SELECT pf.created_by, 'Flat listing', pf.created_at, concat_ws(
      ' · ',
      NULLIF(pf.bhk_type, ''),
      'Rent: ' || COALESCE(pf.rent::text, 'n/a'),
      'Furnishing: ' || COALESCE(pf.furnishing, 'n/a')
    )
    FROM dedup.pool_flat pf JOIN cohort c ON c.id = pf.created_by
    WHERE pf.created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT p.creator_id, 'Flatmate listing', pfm.created_at, concat_ws(
      ' · ',
      'City: ' || COALESCE(pfm.city, 'n/a'),
      'Budget: ' || COALESCE(pfm.target_budget::text, 'n/a'),
      'Urgency: ' || COALESCE(pfm.urgency_level::text, 'n/a')
    )
    FROM dedup.pool_flatmate pfm
    JOIN dedup.pools p ON p.id = pfm.pool_id
    JOIN cohort c ON c.id = p.creator_id
    WHERE pfm.created_at >= now() - (days_back || ' days')::interval
  ),
  per_user AS (
    SELECT
      a.user_id,
      max(a.occurred_at) AS last_activity_at,
      count(*)::bigint AS activity_count,
      jsonb_agg(
        jsonb_build_object('activity_type', a.activity_type, 'occurred_at', a.occurred_at, 'detail', a.detail)
        ORDER BY a.occurred_at DESC
      ) AS events
    FROM activity a
    GROUP BY a.user_id
  ),
  per_cohort AS (
    SELECT
      c.id,
      c.name,
      c.phone,
      c.created_at,
      pu.last_activity_at,
      COALESCE(pu.activity_count, 0) AS activity_count,
      COALESCE(pu.events, '[]'::jsonb) AS events
    FROM cohort c
    LEFT JOIN per_user pu ON pu.user_id = c.id
  ),
  filtered AS (
    SELECT * FROM per_cohort
    WHERE activity_filter = 'all'
      OR (activity_filter = 'active' AND activity_count > 0)
      OR (activity_filter = 'inactive' AND activity_count = 0)
  ),
  capped AS (
    SELECT * FROM filtered
    ORDER BY (activity_count > 0) DESC, last_activity_at DESC NULLS LAST, created_at DESC
    LIMIT GREATEST(user_limit, 1)
  )
  SELECT id, name, phone, created_at, last_activity_at, activity_count, events
  FROM capped
  ORDER BY (activity_count > 0) DESC, last_activity_at DESC NULLS LAST, created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION analytics_new_user_activity_by_user(int, int, text) TO service_role;
