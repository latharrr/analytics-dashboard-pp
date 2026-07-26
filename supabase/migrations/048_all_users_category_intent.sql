-- Adds Category Intent to the All Users page: per user, which content category
-- they actually look at most, how many views that is, and how many distinct
-- categories they've touched. Plus a category filter, so "who is looking at
-- <category>" is answerable directly from the table.
--
-- SOURCE: public.user_tag_affinity, joined tags -> tag_categories. This is real
-- per-user, per-tag interaction counted by the app itself:
--   view_count, like_count, join_count, dismiss_count, total_dwell_ms, score.
-- Measured on the live DB (non-bot users only):
--   38,971 affinity rows across 1,735 users; 120,977 views; 34,278 joins;
--   ~462 hours of dwell; signals from 2026-05-10 through today, still being
--   written. Bots are a clearly separate population (33 users, 178 views) and
--   are excluded by the is_bot = false join, as everywhere else.
--
-- NOTE ON CLAUDE.md: its "CRITICAL data-model facts" #3 claims no page-visit or
-- time-on-screen tracking exists in any tracked table. That is wrong --
-- user_tag_affinity.view_count and .total_dwell_ms are exactly that, at
-- tag/category grain rather than page grain. CLAUDE.md is corrected alongside
-- this migration. Two of the six signals ARE dead, though: chat_msg_count and
-- dismiss_count are 0 for every row, so nothing here uses them.
--
-- RANKING: top category is picked by view_count DESC, because the question is
-- "who is LOOKING at what". The app's own blended `score` column agrees with
-- views on 1,471 of 1,735 users (85%); it's used only as the tie-break, then
-- category label, so the pick is deterministic across refreshes.
--
-- COVERAGE: 1,735 of 7,516 non-bot users (23%) have any affinity row. The rest
-- get NULL, rendered as "—". That is a real absence of signal, not a failure --
-- do not backfill or interpolate it.
--
-- This migration is self-contained: it rebuilds mv_all_users_roster (047) with
-- the four new columns and re-registers the nightly job, so it lands correctly
-- whether or not 047 has been applied yet. Run 047 first if you haven't; the
-- end state is identical either way.

DROP MATERIALIZED VIEW IF EXISTS mv_all_users_roster;
DROP MATERIALIZED VIEW IF EXISTS mv_user_engagement;  -- subsumed by 047; no-op if already gone

CREATE MATERIALIZED VIEW mv_all_users_roster AS
  WITH ev AS (
    SELECT cm.sender_id AS uid, 'Chat message'::text AS activity_type, cm.type::text AS detail,
           cm.created_at AS occurred_at
      FROM dedup.chat_messages cm WHERE cm.sender_id IS NOT NULL
    UNION ALL SELECT tl.user_id, 'Trust action', tl.reason, tl.created_at FROM dedup.trust_ledger tl
    -- LEFT JOIN on purpose: 044 counted dedup.pool_participants with no join at
    -- all, so an INNER JOIN would silently drop joins whose pool row is missing.
    UNION ALL SELECT pp.user_id, 'Joined a pool', p.category, pp.joined_at
      FROM dedup.pool_participants pp LEFT JOIN dedup.pools p ON p.id = pp.pool_id
    UNION ALL SELECT p.creator_id, 'Created a pool', p.category, p.created_at FROM dedup.pools p
    UNION ALL SELECT phq.user_id, 'PG search',
        concat_ws(' · ', 'Budget: ' || COALESCE(phq.budget_range, phq.max_budget::text),
                  'Landing: ' || phq.landing_time),
        phq.created_at
      FROM (SELECT DISTINCT ON (id) * FROM public.pg_hunt_queries ORDER BY id) phq
    UNION ALL SELECT pf.created_by, 'Flat listing', NULLIF(pf.bhk_type, ''), pf.created_at
      FROM dedup.pool_flat pf
    UNION ALL SELECT p.creator_id, 'Flatmate listing', 'City: ' || COALESCE(pfm.city, 'n/a'), pfm.created_at
      FROM dedup.pool_flatmate pfm JOIN dedup.pools p ON p.id = pfm.pool_id
  ),
  agg AS (
    SELECT uid, count(*)::bigint AS total_activities, count(DISTINCT occurred_at::date)::bigint AS active_days
    FROM ev WHERE uid IS NOT NULL GROUP BY uid
  ),
  last_ev AS (
    SELECT DISTINCT ON (uid) uid, activity_type, detail, occurred_at
    FROM ev WHERE uid IS NOT NULL
    ORDER BY uid, occurred_at DESC NULLS LAST
  ),
  -- Category intent: collapse per-tag affinity up to its tag_category.
  cat AS (
    SELECT a.user_id,
           tc.label AS category,
           sum(a.view_count)::bigint AS views,
           sum(a.total_dwell_ms)::bigint AS dwell_ms,
           sum(a.score)::numeric AS score
    FROM dedup.user_tag_affinity a
    JOIN dedup.tags t ON t.id = a.tag_id
    JOIN dedup.tag_categories tc ON tc.id = t.category_id
    GROUP BY a.user_id, tc.label
    HAVING sum(a.view_count) > 0
  ),
  top_cat AS (
    SELECT DISTINCT ON (user_id) user_id, category, views, dwell_ms
    FROM cat
    ORDER BY user_id, views DESC, score DESC, category
  ),
  cat_count AS (
    SELECT user_id, count(*)::int AS n FROM cat GROUP BY user_id
  )
  SELECT
    u.id AS user_id,
    u.name AS user_name,
    u.phone,
    u.created_at AS signed_up_at,
    -- migration 034's sentinel normalisation, baked in once instead of per query
    CASE WHEN u.last_activity < '2000-01-01'::timestamptz THEN NULL ELSE u.last_activity END AS last_active_at,
    u.trust_score,
    u.is_verified,
    u.is_banned,
    COALESCE(a.total_activities, 0)::bigint AS total_activities,
    COALESCE(a.active_days, 0)::bigint AS active_days,
    le.activity_type AS last_activity_type,
    le.detail AS last_activity_detail,
    le.occurred_at AS last_activity_occurred_at,
    tcat.category AS top_category,
    tcat.views AS top_category_views,
    tcat.dwell_ms AS top_category_dwell_ms,
    COALESCE(cc.n, 0) AS category_count
  FROM dedup.users u
  LEFT JOIN agg a ON a.uid = u.id
  LEFT JOIN last_ev le ON le.uid = u.id
  LEFT JOIN top_cat tcat ON tcat.user_id = u.id
  LEFT JOIN cat_count cc ON cc.user_id = u.id
  WHERE u.is_bot = false;

CREATE UNIQUE INDEX idx_mv_all_users_roster_user_id ON mv_all_users_roster (user_id);
-- Backs the category filter without scanning the whole view.
CREATE INDEX idx_mv_all_users_roster_top_category ON mv_all_users_roster (top_category);

GRANT SELECT ON mv_all_users_roster TO service_role;


-- The category list for the filter dropdown, with how many users each covers.
CREATE OR REPLACE FUNCTION analytics_all_users_categories()
RETURNS TABLE(category text, user_count bigint, total_views bigint)
LANGUAGE sql STABLE AS $$
  SELECT top_category, count(*)::bigint, COALESCE(sum(top_category_views), 0)::bigint
  FROM mv_all_users_roster
  WHERE top_category IS NOT NULL
  GROUP BY top_category
  ORDER BY count(*) DESC, top_category;
$$;

GRANT EXECUTE ON FUNCTION analytics_all_users_categories() TO service_role;


-- Signature changes (adds category_filter, and 'category_views' as a sort key),
-- so the old 10-arg version is DROPped first rather than CREATE OR REPLACEd --
-- matching migrations 023/028/030/039 -- to avoid an ambiguous overload.
DROP FUNCTION IF EXISTS analytics_all_users_engagement(
  text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, int, int
);

CREATE FUNCTION analytics_all_users_engagement(
  search_text text DEFAULT NULL,
  signed_up_from timestamptz DEFAULT NULL,
  signed_up_to timestamptz DEFAULT NULL,
  last_active_from timestamptz DEFAULT NULL,
  last_active_to timestamptz DEFAULT NULL,
  activity_filter text DEFAULT 'all',
  category_filter text DEFAULT NULL,
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
  top_category text,
  top_category_views bigint,
  top_category_dwell_ms bigint,
  category_count int,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    -- Clamp stays 10000 (not 200) so the CSV/XLSX export, which pages at 1000
    -- rows/page, fetches the whole filtered set instead of truncating.
    SELECT GREATEST(page_number, 1) AS pg_num, LEAST(GREATEST(page_size, 1), 10000) AS pg_size
  ),
  calc AS (
    SELECT r.*, GREATEST(1, (now()::date - r.signed_up_at::date)) AS days_since_signup_calc
    FROM mv_all_users_roster r
  ),
  scored AS (
    SELECT c.*,
      CASE WHEN c.active_days > 0
        THEN round(c.total_activities::numeric / c.active_days, 2) END AS engagement_density_calc,
      round(c.active_days::numeric / c.days_since_signup_calc, 3) AS retention_score_calc
    FROM calc c
  ),
  filtered AS (
    SELECT s.*, count(*) OVER ()::bigint AS total_count_calc
    FROM scored s
    WHERE (search_text IS NULL OR s.user_name ILIKE '%' || search_text || '%' OR s.phone ILIKE '%' || search_text || '%')
      AND (signed_up_from IS NULL OR s.signed_up_at >= signed_up_from)
      AND (signed_up_to IS NULL OR s.signed_up_at <= signed_up_to)
      AND (last_active_from IS NULL OR s.last_active_at >= last_active_from)
      AND (last_active_to IS NULL OR s.last_active_at <= last_active_to)
      AND (
        activity_filter = 'all'
        OR (activity_filter = 'active' AND s.total_activities > 0)
        OR (activity_filter = 'inactive' AND s.total_activities = 0)
      )
      -- 'none' pulls the users with no category signal at all, which is the
      -- other half of "who is looking at what".
      AND (
        category_filter IS NULL
        OR (category_filter = 'none' AND s.top_category IS NULL)
        OR s.top_category = category_filter
      )
  ),
  ranked AS (
    SELECT f.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN sort_by = 'last_active' AND sort_dir = 'asc' THEN f.last_active_at END ASC NULLS LAST,
          CASE WHEN sort_by = 'last_active' AND sort_dir = 'desc' THEN f.last_active_at END DESC NULLS LAST,
          CASE WHEN sort_by = 'signed_up' AND sort_dir = 'asc' THEN f.signed_up_at END ASC NULLS LAST,
          CASE WHEN sort_by = 'signed_up' AND sort_dir = 'desc' THEN f.signed_up_at END DESC NULLS LAST,
          CASE WHEN sort_by = 'name' AND sort_dir = 'asc' THEN f.user_name END ASC NULLS LAST,
          CASE WHEN sort_by = 'name' AND sort_dir = 'desc' THEN f.user_name END DESC NULLS LAST,
          CASE WHEN sort_by = 'trust_score' AND sort_dir = 'asc' THEN f.trust_score END ASC NULLS LAST,
          CASE WHEN sort_by = 'trust_score' AND sort_dir = 'desc' THEN f.trust_score END DESC NULLS LAST,
          CASE WHEN sort_by = 'activities' AND sort_dir = 'asc' THEN f.total_activities END ASC NULLS LAST,
          CASE WHEN sort_by = 'activities' AND sort_dir = 'desc' THEN f.total_activities END DESC NULLS LAST,
          CASE WHEN sort_by = 'engagement_density' AND sort_dir = 'asc' THEN f.engagement_density_calc END ASC NULLS LAST,
          CASE WHEN sort_by = 'engagement_density' AND sort_dir = 'desc' THEN f.engagement_density_calc END DESC NULLS LAST,
          CASE WHEN sort_by = 'retention_score' AND sort_dir = 'asc' THEN f.retention_score_calc END ASC NULLS LAST,
          CASE WHEN sort_by = 'retention_score' AND sort_dir = 'desc' THEN f.retention_score_calc END DESC NULLS LAST,
          CASE WHEN sort_by = 'category_views' AND sort_dir = 'asc' THEN f.top_category_views END ASC NULLS LAST,
          CASE WHEN sort_by = 'category_views' AND sort_dir = 'desc' THEN f.top_category_views END DESC NULLS LAST,
          f.last_active_at DESC NULLS LAST
      ) AS rn
    FROM filtered f
  )
  SELECT
    r.user_id, r.user_name, r.phone, r.signed_up_at, r.last_active_at, r.trust_score,
    r.is_verified, r.is_banned, r.total_activities, r.active_days,
    r.days_since_signup_calc, r.engagement_density_calc, r.retention_score_calc,
    r.last_activity_type, r.last_activity_detail, r.last_activity_occurred_at,
    r.top_category, r.top_category_views, r.top_category_dwell_ms, r.category_count,
    r.total_count_calc
  FROM ranked r, bounds b
  WHERE r.rn > (b.pg_num - 1) * b.pg_size AND r.rn <= b.pg_num * b.pg_size
  ORDER BY r.rn;
$$;

GRANT EXECUTE ON FUNCTION analytics_all_users_engagement(
  text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text, int, int
) TO service_role;


-- Re-register the nightly job (updates in place, migration 017's approach).
SELECT cron.schedule(
  'refresh-analytics-kpis',
  '30 21 * * *',
  $$
    REFRESH MATERIALIZED VIEW mv_all_users_roster;
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
