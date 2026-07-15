-- Pool KPIs. Real pools.status values confirmed via introspection: draft,
-- active, closed, pending_review. "closed" is treated as a completed pool.
-- Real pools.category values confirmed: ranting, ask_around, buy_sell,
-- event, flatmate, flat, cab_share.
CREATE MATERIALIZED VIEW mv_pool_kpis AS
SELECT
  (SELECT count(*) FROM pools) AS total_pools,
  (SELECT count(*) FROM pools WHERE created_at >= now() - interval '30 days') AS new_pools_last_30_days,
  (SELECT count(*) FROM pools WHERE status = 'active') AS active_pools,
  (SELECT count(*) FROM pools WHERE status = 'closed') AS closed_pools,
  (SELECT count(*) FROM pools WHERE status = 'draft') AS draft_pools,
  (SELECT round(100.0 * count(*) FILTER (WHERE status = 'closed') / NULLIF(count(*), 0), 1) FROM pools) AS overall_completion_rate_pct,
  (
    SELECT category FROM pools
    GROUP BY category
    ORDER BY (count(*) FILTER (WHERE status = 'closed'))::numeric / NULLIF(count(*), 0) DESC
    LIMIT 1
  ) AS best_completion_category,
  (SELECT count(*) FROM pool_participants WHERE status = 'approved') AS approved_participants,
  (SELECT round(avg(participant_count)::numeric, 1) FROM pools) AS avg_participants_per_pool,
  (SELECT count(*) FROM pool_likes) AS total_likes,
  (SELECT count(*) FROM pool_flat) AS flat_listings,
  (SELECT count(*) FROM pool_flatmate) AS flatmate_listings,
  (SELECT count(*) FROM pool_cab_share) AS cab_share_listings,
  (SELECT count(*) FROM pool_event) AS events_listed,
  (SELECT count(*) FROM pool_buy_sell) AS buy_sell_listings,
  (SELECT count(*) FROM pool_ranting) AS rants,
  (SELECT count(*) FROM vehicles) AS registered_vehicles;

CREATE UNIQUE INDEX ON mv_pool_kpis ((1));
GRANT SELECT ON mv_pool_kpis TO analytics_readonly;
