-- Category Intent dashboard: the platform-wide view of what users are looking
-- at, alongside the per-user "Top category" column added in 048.
--
-- Same source as 048 (public.user_tag_affinity joined tags -> tag_categories),
-- aggregated to one row per category instead of one per user. Non-bot only.
--
-- Materialized rather than computed per request, for the reason this whole
-- 045-048 sequence exists: request-time queries against these tables are fine
-- warm and blow the 8s PostgREST budget cold, and this page will be visited
-- rarely enough to be cold every time. The result is 11 rows, so the page cost
-- is a rounding error either way; the MV just makes it unconditional.
--
-- Distinct from mv_all_users_roster's category columns: the roster keeps only
-- each user's single TOP category, so summing it would undercount every other
-- category a user engages with. This aggregates ALL affinity rows, which is why
-- the user counts here are larger than the roster's per-category counts (a user
-- interested in 11 categories is counted in all 11 here, but only in their top
-- one there). Both are correct for their own question; don't cross-reference
-- them expecting a match.

DROP MATERIALIZED VIEW IF EXISTS mv_category_intent;
CREATE MATERIALIZED VIEW mv_category_intent AS
  WITH aff AS (
    SELECT a.user_id, a.tag_id, t.label AS tag_label, tc.label AS category,
           a.view_count, a.join_count, a.like_count, a.total_dwell_ms, a.last_signal_at
    FROM dedup.user_tag_affinity a
    JOIN dedup.users u ON u.id = a.user_id AND u.is_bot = false
    JOIN dedup.tags t ON t.id = a.tag_id
    JOIN dedup.tag_categories tc ON tc.id = t.category_id
  ),
  per_tag AS (
    SELECT category, tag_label, sum(view_count)::bigint AS views
    FROM aff GROUP BY category, tag_label
  ),
  top_tags AS (
    SELECT category, string_agg(tag_label, ', ' ORDER BY views DESC, tag_label) AS top_tags
    FROM (
      SELECT category, tag_label, views,
             row_number() OVER (PARTITION BY category ORDER BY views DESC, tag_label) AS rn
      FROM per_tag WHERE views > 0
    ) x WHERE rn <= 3
    GROUP BY category
  )
  SELECT
    a.category,
    count(DISTINCT a.user_id)::bigint AS users,
    count(DISTINCT a.tag_id)::bigint AS tags,
    sum(a.view_count)::bigint AS views,
    sum(a.join_count)::bigint AS joins,
    sum(a.like_count)::bigint AS likes,
    sum(a.total_dwell_ms)::bigint AS dwell_ms,
    -- Views per user who engaged with this category at all, not per all users.
    round(sum(a.view_count)::numeric / NULLIF(count(DISTINCT a.user_id), 0), 1) AS views_per_user,
    max(a.last_signal_at) AS last_signal_at,
    tt.top_tags
  FROM aff a
  LEFT JOIN top_tags tt ON tt.category = a.category
  GROUP BY a.category, tt.top_tags;

CREATE UNIQUE INDEX idx_mv_category_intent_category ON mv_category_intent (category);

GRANT SELECT ON mv_category_intent TO service_role;


CREATE OR REPLACE FUNCTION analytics_category_intent()
RETURNS TABLE(
  category text,
  users bigint,
  tags bigint,
  views bigint,
  joins bigint,
  likes bigint,
  dwell_ms bigint,
  views_per_user numeric,
  last_signal_at timestamptz,
  top_tags text
)
LANGUAGE sql STABLE AS $$
  SELECT category, users, tags, views, joins, likes, dwell_ms, views_per_user, last_signal_at, top_tags
  FROM mv_category_intent
  ORDER BY views DESC, category;
$$;

GRANT EXECUTE ON FUNCTION analytics_category_intent() TO service_role;


-- Add to the nightly refresh (re-registers in place, migration 017's approach).
SELECT cron.schedule(
  'refresh-analytics-kpis',
  '30 21 * * *',
  $$
    REFRESH MATERIALIZED VIEW mv_all_users_roster;
    REFRESH MATERIALIZED VIEW mv_category_intent;
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
