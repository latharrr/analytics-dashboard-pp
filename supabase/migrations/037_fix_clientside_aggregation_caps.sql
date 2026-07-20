-- Fixes three "silently capped at 1000 rows" bugs.
--
-- This Supabase project's REST API has a default "Max rows" of 1000
-- (Settings -> API). Any supabase-js `.select()` without an explicit
-- `.range()`/`.limit()` therefore returns at most 1000 rows. Three places
-- read a *raw* public table (which migration 018 established is ~2-3x
-- duplicated) into JS and aggregated there — so they hit the 1000-row cap
-- after only ~330 distinct rows and undercounted:
--   - getTopCollegesByUsers()  -> Overview + Growth "Top colleges" chart,
--     Telegram "Top colleges" button (read raw public.user_colleges)
--   - getPoolCompletionByCategory() -> Pools "completion by category" chart,
--     Telegram "Pool completion %" button (read raw public.pools)
-- Both are moved here into SQL functions on the dedup.* views, matching how
-- every other breakdown in this app already works (dedup once, aggregate in
-- the database, return only the small result set). The JS wrappers in
-- src/lib/db/growthBreakdown.ts and poolBreakdown.ts now call these.
--
-- Separately, analytics_all_users_detail() clamped page_size to 200. That's
-- right for the interactive table, but the CSV/XLSX export routes pass
-- page_size = 10000 to fetch the whole filtered set on one page — so exports
-- were silently truncated to 200 users even though the UI promises "up to
-- 10,000." The clamp is raised to 10,000; the interactive UI still requests
-- 50/page, so nothing else changes. Body is otherwise identical to migration
-- 034.

-- ---------------------------------------------------------------------------
-- 1. Top colleges by (deduped, non-bot) verified membership.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_top_colleges_by_users(row_limit int DEFAULT 5)
RETURNS TABLE(college_name text, user_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT col.name, count(DISTINCT uc.user_id)::bigint
  FROM dedup.user_colleges uc
  JOIN dedup.users u ON u.id = uc.user_id AND u.is_bot = false
  JOIN dedup.colleges col ON col.id = uc.college_id
  WHERE uc.verification_status = 'verified'
  GROUP BY col.id, col.name
  ORDER BY 2 DESC
  LIMIT GREATEST(row_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION analytics_top_colleges_by_users(int) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Pool completion rate (% closed) per category, over deduped pools.
--    Matches mv_pool_kpis' definition of "completed" (status = 'closed')
--    and the previous JS rounding (one decimal place).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analytics_pool_completion_by_category()
RETURNS TABLE(category text, completion_rate_pct numeric)
LANGUAGE sql STABLE AS $$
  SELECT
    p.category,
    round(100.0 * count(*) FILTER (WHERE p.status = 'closed') / NULLIF(count(*), 0), 1)
  FROM dedup.pools p
  GROUP BY p.category
  ORDER BY 2 DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION analytics_pool_completion_by_category() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Raise analytics_all_users_detail()'s page_size clamp 200 -> 10000 so
--    CSV/XLSX exports return the whole filtered set. Body identical to
--    migration 034 otherwise.
-- ---------------------------------------------------------------------------
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
      LEAST(GREATEST(page_size, 1), 10000) AS pg_size
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
  text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, int, int
) TO service_role;
