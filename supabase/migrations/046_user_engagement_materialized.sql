-- Real fix for the All Users page returning 0 users ("canceling statement due
-- to statement timeout" on /api/all-users).
--
-- MEASURED against the live DB (analytics_readonly, statement_timeout raised):
--   agg CTE exactly as migration 044 wrote it ......... 19,484 ms
--   same agg, narrow rewrite (no wide DISTINCT ON *) ... 6,851 ms
--   roster + page + LATERAL last-activity (all else) ... 3,502 ms
--   dedup.users roster alone ............................. 353 ms
--
-- The budget is 8s: PostgREST connects as `authenticator`, which carries
-- `statement_timeout=8s`, and `service_role` has no rolconfig of its own so it
-- inherits that. (The SQL editor runs as `postgres` with no such limit, which
-- is why 044 looked fine when it was written -- test performance, not just
-- correctness.) At 19.5s the aggregate alone is ~2.4x over budget, so the page
-- has never once rendered; even the narrow rewrite (6.9 + 3.5 = 10.4s) misses.
--
-- Migration 044's comment sized this as "~1,500 active users / ~71k events".
-- The tables have grown well past that AND the importer has re-run many more
-- times since: chat_messages is now 520,243 raw rows deduping to 32,006 (~16x
-- duplication, not the ~2-3x documented in CLAUDE.md), trust_ledger 477,767 ->
-- 30,144, pool_participants 222,317 -> 14,508. ~1.27M raw rows get sorted and
-- deduped on every single page load.
--
-- No amount of indexing fixes a full-table aggregate of that size inside 8s
-- (migration 045 added the dedup sort indexes -- they help the sorts and the
-- refresh below, but did not and cannot bring 19.5s under 8s). Precomputing is
-- the answer, and it's this repo's established pattern: the KPI tabs already
-- read nightly-refreshed materialized views, and the dashboard header already
-- advertises staleness ("Last refreshed: 11h ago").
--
-- Correctness note: the view below reuses migration 044's aggregate expression
-- VERBATIM -- the same dedup.* views, the same inline pg_hunt_queries dedup.
-- The narrow rewrite measured above is faster but changes the dedup semantics
-- (it would double-count any id whose duplicate snapshots differ in the user or
-- timestamp column), and there is no reason to take that risk here: refresh
-- runs in pg_cron as `postgres`, where 19.5s once a night is irrelevant.

-- 1) Per-user activity aggregate, precomputed.
DROP MATERIALIZED VIEW IF EXISTS mv_user_engagement;
CREATE MATERIALIZED VIEW mv_user_engagement AS
  WITH ev AS (
    SELECT sender_id AS uid, created_at AS ts FROM dedup.chat_messages WHERE sender_id IS NOT NULL
    UNION ALL SELECT user_id, created_at FROM dedup.trust_ledger
    UNION ALL SELECT user_id, joined_at FROM dedup.pool_participants
    UNION ALL SELECT creator_id, created_at FROM dedup.pools
    UNION ALL SELECT user_id, created_at
      FROM (SELECT DISTINCT ON (id) id, user_id, created_at FROM public.pg_hunt_queries ORDER BY id) phq_dedup
    UNION ALL SELECT created_by, created_at FROM dedup.pool_flat
    UNION ALL SELECT p.creator_id, pfm.created_at
      FROM dedup.pool_flatmate pfm JOIN dedup.pools p ON p.id = pfm.pool_id
  )
  SELECT
    uid AS user_id,
    count(*)::bigint AS total_activities,
    count(DISTINCT ts::date)::bigint AS active_days
  FROM ev
  WHERE uid IS NOT NULL
  GROUP BY uid;

-- Unique by construction (GROUP BY uid). Unlike the public.* tables, this view
-- is ours -- the external importer never writes to it -- so a unique index adds
-- no risk, and it makes the join below an index lookup. It also keeps the door
-- open for REFRESH ... CONCURRENTLY, which migration 017 could not use because
-- the KPI views were indexed on the expression `(1)`.
CREATE UNIQUE INDEX idx_mv_user_engagement_user_id ON mv_user_engagement (user_id);

GRANT SELECT ON mv_user_engagement TO service_role;


-- 2) Point the All Users function at the precomputed aggregate. Body is
--    migration 044's, with the inline `agg` CTE swapped for the view; the
--    signature is unchanged, so CREATE OR REPLACE is safe and the app needs no
--    code change. days_since_signup / retention_score still use now(), so they
--    stay live and correct as the day advances -- only the activity counts
--    carry the nightly staleness the rest of the dashboard already has.
CREATE OR REPLACE FUNCTION analytics_all_users_engagement(
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
  total_activities bigint,
  active_days bigint,
  days_since_signup int,
  engagement_density numeric,
  retention_score numeric,
  last_activity_type text,
  last_activity_detail text,
  last_activity_occurred_at timestamptz,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    -- Clamp stays 10000 (not 200) so the CSV/XLSX export, which pages at 1000
    -- rows/page, fetches the whole filtered set instead of truncating.
    SELECT GREATEST(page_number, 1) AS pg_num, LEAST(GREATEST(page_size, 1), 10000) AS pg_size
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
      CASE WHEN u.last_activity < '2000-01-01'::timestamptz THEN NULL ELSE u.last_activity END AS last_active,
      COALESCE(a.total_activities, 0) AS total_activities,
      COALESCE(a.active_days, 0) AS active_days,
      GREATEST(1, (now()::date - u.created_at::date)) AS days_since_signup
    FROM dedup.users u
    LEFT JOIN mv_user_engagement a ON a.user_id = u.id
    WHERE u.is_bot = false
  ),
  calc AS (
    SELECT b.*,
      CASE WHEN b.active_days > 0
        THEN round(b.total_activities::numeric / b.active_days, 2) END AS engagement_density,
      round(b.active_days::numeric / b.days_since_signup, 3) AS retention_score
    FROM base b
  ),
  filtered AS (
    SELECT c.*, count(*) OVER ()::bigint AS total_count
    FROM calc c
    WHERE (search_text IS NULL OR c.name ILIKE '%' || search_text || '%' OR c.phone ILIKE '%' || search_text || '%')
      AND (signed_up_from IS NULL OR c.created_at >= signed_up_from)
      AND (signed_up_to IS NULL OR c.created_at <= signed_up_to)
      AND (last_active_from IS NULL OR c.last_active >= last_active_from)
      AND (last_active_to IS NULL OR c.last_active <= last_active_to)
      AND (
        activity_filter = 'all'
        OR (activity_filter = 'active' AND c.total_activities > 0)
        OR (activity_filter = 'inactive' AND c.total_activities = 0)
      )
  ),
  ranked AS (
    SELECT f.*,
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
          CASE WHEN sort_by = 'activities' AND sort_dir = 'asc' THEN f.total_activities END ASC NULLS LAST,
          CASE WHEN sort_by = 'activities' AND sort_dir = 'desc' THEN f.total_activities END DESC NULLS LAST,
          CASE WHEN sort_by = 'engagement_density' AND sort_dir = 'asc' THEN f.engagement_density END ASC NULLS LAST,
          CASE WHEN sort_by = 'engagement_density' AND sort_dir = 'desc' THEN f.engagement_density END DESC NULLS LAST,
          CASE WHEN sort_by = 'retention_score' AND sort_dir = 'asc' THEN f.retention_score END ASC NULLS LAST,
          CASE WHEN sort_by = 'retention_score' AND sort_dir = 'desc' THEN f.retention_score END DESC NULLS LAST,
          f.last_active DESC NULLS LAST
      ) AS rn
    FROM filtered f
  ),
  page AS (
    SELECT r.* FROM ranked r, bounds b
    WHERE r.rn > (b.pg_num - 1) * b.pg_size AND r.rn <= b.pg_num * b.pg_size
  )
  SELECT
    pu.id, pu.name, pu.phone, pu.created_at, pu.last_active, pu.trust_score, pu.is_verified, pu.is_banned,
    pu.total_activities, pu.active_days, pu.days_since_signup, pu.engagement_density, pu.retention_score,
    la.activity_type, la.detail, la.occurred_at, pu.total_count
  FROM page pu
  LEFT JOIN LATERAL (
    SELECT e.activity_type, e.detail, e.occurred_at
    FROM (
      SELECT 'Chat message'::text AS activity_type, cm.type::text AS detail, cm.created_at AS occurred_at
      FROM public.chat_messages cm WHERE cm.sender_id = pu.id
      UNION ALL SELECT 'Trust action', tl.reason, tl.created_at FROM public.trust_ledger tl WHERE tl.user_id = pu.id
      UNION ALL SELECT 'Joined a pool', jp.category, jpp.joined_at
        FROM public.pool_participants jpp JOIN public.pools jp ON jp.id = jpp.pool_id WHERE jpp.user_id = pu.id
      UNION ALL SELECT 'Created a pool', cp.category, cp.created_at FROM public.pools cp WHERE cp.creator_id = pu.id
      UNION ALL SELECT 'PG search', concat_ws(' · ', 'Budget: ' || COALESCE(phq.budget_range, phq.max_budget::text), 'Landing: ' || phq.landing_time), phq.created_at
        FROM public.pg_hunt_queries phq WHERE phq.user_id = pu.id
      UNION ALL SELECT 'Flat listing', NULLIF(pf.bhk_type, ''), pf.created_at FROM public.pool_flat pf WHERE pf.created_by = pu.id
      UNION ALL SELECT 'Flatmate listing', 'City: ' || COALESCE(pfm.city, 'n/a'), pfm.created_at
        FROM public.pools fp JOIN public.pool_flatmate pfm ON pfm.pool_id = fp.id WHERE fp.creator_id = pu.id
    ) e
    ORDER BY e.occurred_at DESC NULLS LAST
    LIMIT 1
  ) la ON true
  ORDER BY pu.rn;
$$;

GRANT EXECUTE ON FUNCTION analytics_all_users_engagement(
  text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, int, int
) TO service_role;


-- 3) Add the new view to the nightly refresh. Re-registering the job under the
--    same name updates it in place (same approach as migration 017). Ordered
--    first because it's the slowest of the batch.
SELECT cron.schedule(
  'refresh-analytics-kpis',
  '30 21 * * *',
  $$
    REFRESH MATERIALIZED VIEW mv_user_engagement;
    REFRESH MATERIALIZED VIEW mv_growth_kpis;
    REFRESH MATERIALIZED VIEW mv_pool_kpis;
    REFRESH MATERIALIZED VIEW mv_chat_kpis;
    REFRESH MATERIALIZED VIEW mv_trust_kpis;
    REFRESH MATERIALIZED VIEW mv_monetization_kpis;
    REFRESH MATERIALIZED VIEW mv_matching_kpis;
    REFRESH MATERIALIZED VIEW mv_ai_copilot_kpis;
    INSERT INTO analytics_refresh_log (view_name, refreshed_at)
    VALUES ('all', now())
    ON CONFLICT (view_name) DO UPDATE SET refreshed_at = now();
  $$
);
