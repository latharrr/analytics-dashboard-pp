-- Enable pg_cron first (Supabase dashboard: Database -> Extensions) before
-- running this. Refreshes all 7 KPI materialized views nightly at 3:00 AM
-- IST (21:30 UTC) and updates the refresh badge's timestamp.
SELECT cron.schedule(
  'refresh-analytics-kpis',
  '30 21 * * *',
  $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_growth_kpis;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_pool_kpis;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_chat_kpis;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_trust_kpis;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monetization_kpis;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_matching_kpis;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ai_copilot_kpis;
    INSERT INTO analytics_refresh_log (view_name, refreshed_at)
    VALUES ('all', now())
    ON CONFLICT (view_name) DO UPDATE SET refreshed_at = now();
  $$
);
