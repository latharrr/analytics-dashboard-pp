-- Adds POOL categories to the Category Intent page, alongside the content/tag
-- categories added in 049.
--
-- These are two genuinely different dimensions and are presented as separate
-- tabs, not merged:
--   * Content categories (049, mv_category_intent) come from user_tag_affinity
--     -> tags -> tag_categories: what users BROWSE (views, dwell, likes).
--   * Pool categories (this migration) come from pools.category: what users
--     actually CREATE and JOIN. There is no view_count or dwell for pools, so
--     the metrics here are pools/creators/joins/joiners. Merging the two into
--     one table would put unrelated numbers in the same columns.
--
-- MEASURED (non-bot creators and joiners):
--   ask_around  1163 pools /  397 creators / 5915 joins /  930 joiners
--   ranting     1473 pools /  693 creators / 4865 joins / 1137 joiners
--   buy_sell     126 /  70 /  346 / 175
--   event        100 /  67 /  214 / 141
--   cab_share     30 /  17 /   38 /  19
--   flat          44 /   6 /    0 /   0
--   flatmate      57 /  30 /    0 /   0
--   pg            48 /   2 /    0 /   0
--
-- TWO THINGS WORTH KNOWING:
--  1. flat, flatmate and pg have ZERO participants. They are listing-type
--     pools -- you post one, nobody "joins" it -- so their real signal is pools
--     created and distinct creators, not joins. A joins-only view of these
--     would read as "no interest", which is wrong. Both metrics are shown.
--  2. 'ranting' was not in the request but is the largest category by pools
--     (1,473) and second by joins. It is INCLUDED here; excluding the biggest
--     vertical would silently distort every share/total on the page. Drop it
--     with a WHERE clause if that was deliberate.
--
-- Labels are mapped in SQL, not the client, so the page, API and any future
-- export all agree on "Buy & Sell" vs "buy_sell".

DROP MATERIALIZED VIEW IF EXISTS mv_pool_category_intent;
CREATE MATERIALIZED VIEW mv_pool_category_intent AS
  WITH p AS (
    SELECT id, category, creator_id, created_at
    FROM dedup.pools
    WHERE COALESCE(NULLIF(category, ''), '') <> ''
  ),
  j AS (
    SELECT pp.pool_id, pp.user_id, pp.joined_at
    FROM dedup.pool_participants pp
    JOIN dedup.users u ON u.id = pp.user_id AND u.is_bot = false
  )
  SELECT
    p.category AS category_slug,
    CASE p.category
      WHEN 'ask_around' THEN 'Ask Around'
      WHEN 'ranting'    THEN 'Ranting'
      WHEN 'buy_sell'   THEN 'Buy & Sell'
      WHEN 'event'      THEN 'Event'
      WHEN 'cab_share'  THEN 'Cab Share'
      WHEN 'flat'       THEN 'Flat'
      WHEN 'flatmate'   THEN 'Flatmate'
      WHEN 'pg'         THEN 'PG'
      ELSE initcap(replace(p.category, '_', ' '))
    END AS category,
    count(DISTINCT p.id)::bigint AS pools,
    count(DISTINCT p.creator_id) FILTER (WHERE cu.is_bot = false)::bigint AS creators,
    count(j.user_id)::bigint AS joins,
    count(DISTINCT j.user_id)::bigint AS joiners,
    -- Listing-type verticals (flat/flatmate/pg) have no participants at all;
    -- flagged so the UI can say so instead of rendering a bare 0.
    (count(j.user_id) = 0) AS is_listing_only,
    max(p.created_at) AS newest_pool_at,
    max(j.joined_at) AS newest_join_at
  FROM p
  LEFT JOIN dedup.users cu ON cu.id = p.creator_id
  LEFT JOIN j ON j.pool_id = p.id
  GROUP BY p.category;

CREATE UNIQUE INDEX idx_mv_pool_category_intent_slug ON mv_pool_category_intent (category_slug);

GRANT SELECT ON mv_pool_category_intent TO service_role;


CREATE OR REPLACE FUNCTION analytics_pool_category_intent()
RETURNS TABLE(
  category_slug text,
  category text,
  pools bigint,
  creators bigint,
  joins bigint,
  joiners bigint,
  is_listing_only boolean,
  newest_pool_at timestamptz,
  newest_join_at timestamptz
)
LANGUAGE sql STABLE AS $$
  SELECT category_slug, category, pools, creators, joins, joiners,
         is_listing_only, newest_pool_at, newest_join_at
  FROM mv_pool_category_intent
  ORDER BY joins DESC, pools DESC, category;
$$;

GRANT EXECUTE ON FUNCTION analytics_pool_category_intent() TO service_role;


-- Add to the nightly refresh (re-registers in place, migration 017's approach).
SELECT cron.schedule(
  'refresh-analytics-kpis',
  '30 21 * * *',
  $$
    REFRESH MATERIALIZED VIEW mv_all_users_roster;
    REFRESH MATERIALIZED VIEW mv_category_intent;
    REFRESH MATERIALIZED VIEW mv_pool_category_intent;
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
