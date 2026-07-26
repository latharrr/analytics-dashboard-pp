-- Makes the Pool categories rows clickable: expand a category to see the users
-- behind it -- who created pools there, who joined, and when they were last
-- active in that category.
--
-- Materialized rather than queried live. Measured warm, per category:
--   pg 1,252-1,661ms · ask_around 1,586-2,053ms · ranting 1,414-1,599ms
-- That is fine warm but the cold multiple would put it near or past the 8s
-- PostgREST budget, which is exactly the trap that 044-047 fell into. The whole
-- result set across all 8 categories is 2,441 rows, so precomputing it costs
-- nothing and removes the question entirely.
--
-- Grain: one row per (category, user) where the user created OR joined at least
-- one pool in that category. A user active in several categories appears once
-- per category, which is the point -- this answers "who is in this category",
-- not "how does the user base split".
--
-- Non-bot only, consistent with the rest of the dashboard. Note flat/flatmate/
-- pg have no participants at all (see 050), so for those categories every row
-- here is a creator with pools_joined = 0 -- e.g. PG resolves to just 2 users.

DROP MATERIALIZED VIEW IF EXISTS mv_pool_category_users;
CREATE MATERIALIZED VIEW mv_pool_category_users AS
  WITH cat_pools AS (
    SELECT id, category, creator_id, created_at
    FROM dedup.pools
    WHERE COALESCE(NULLIF(category, ''), '') <> ''
  ),
  creators AS (
    SELECT category, creator_id AS uid, count(*)::bigint AS pools_created, max(created_at) AS last_at
    FROM cat_pools
    WHERE creator_id IS NOT NULL
    GROUP BY category, creator_id
  ),
  joiners AS (
    SELECT cp.category, pp.user_id AS uid, count(*)::bigint AS pools_joined, max(pp.joined_at) AS last_at
    FROM dedup.pool_participants pp
    JOIN cat_pools cp ON cp.id = pp.pool_id
    GROUP BY cp.category, pp.user_id
  ),
  combined AS (
    SELECT category, uid FROM creators
    UNION
    SELECT category, uid FROM joiners
  )
  SELECT
    cb.category AS category_slug,
    u.id AS user_id,
    u.name AS user_name,
    u.phone,
    COALESCE(c.pools_created, 0)::bigint AS pools_created,
    COALESCE(j.pools_joined, 0)::bigint AS pools_joined,
    GREATEST(c.last_at, j.last_at) AS last_activity_at,
    u.trust_score,
    u.is_verified
  FROM combined cb
  JOIN dedup.users u ON u.id = cb.uid AND u.is_bot = false
  LEFT JOIN creators c ON c.category = cb.category AND c.uid = cb.uid
  LEFT JOIN joiners j ON j.category = cb.category AND j.uid = cb.uid;

CREATE UNIQUE INDEX idx_mv_pool_category_users_pk ON mv_pool_category_users (category_slug, user_id);

GRANT SELECT ON mv_pool_category_users TO service_role;


CREATE OR REPLACE FUNCTION analytics_pool_category_users(
  target_category text,
  row_limit int DEFAULT 500
)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  phone text,
  pools_created bigint,
  pools_joined bigint,
  last_activity_at timestamptz,
  trust_score numeric,
  is_verified boolean,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  WITH matched AS (
    SELECT m.*, count(*) OVER ()::bigint AS total_count
    FROM mv_pool_category_users m
    WHERE m.category_slug = target_category
  )
  SELECT user_id, user_name, phone, pools_created, pools_joined, last_activity_at,
         trust_score, is_verified, total_count
  FROM matched
  ORDER BY pools_created DESC, pools_joined DESC, last_activity_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(row_limit, 1), 10000);
$$;

GRANT EXECUTE ON FUNCTION analytics_pool_category_users(text, int) TO service_role;


-- Add to the nightly refresh (re-registers in place, migration 017's approach).
SELECT cron.schedule(
  'refresh-analytics-kpis',
  '30 21 * * *',
  $$
    REFRESH MATERIALIZED VIEW mv_all_users_roster;
    REFRESH MATERIALIZED VIEW mv_category_intent;
    REFRESH MATERIALIZED VIEW mv_pool_category_intent;
    REFRESH MATERIALIZED VIEW mv_pool_category_users;
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
