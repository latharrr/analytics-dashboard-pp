-- Fixes the nightly KPI refresh job added in migration 010, which has been
-- silently failing every night since deploy:
--
--   ERROR:  cannot refresh materialized view "public.mv_growth_kpis" concurrently
--   HINT:   Create a unique index with no WHERE clause on one or more
--           columns of the materialized view.
--
-- REFRESH MATERIALIZED VIEW CONCURRENTLY requires a unique index on an
-- actual column, but migrations 003-009 gave each single-row KPI view a
-- unique index on the expression `(1)` (a trick to satisfy "must be
-- unique" for a one-row view). Postgres rejects expression indexes for
-- CONCURRENTLY specifically, so the very first REFRESH in the batch threw,
-- the whole cron job body aborted, and analytics_refresh_log never got its
-- first row — every KPI dashboard tab has been showing data frozen at
-- whatever existed when the views were created.
--
-- Fix: drop CONCURRENTLY. These are tiny single-row aggregate views with no
-- concurrent-read traffic at 3 AM; a brief exclusive lock during refresh is
-- harmless. Re-registering the job under the same name updates it in place.
SELECT cron.schedule(
  'refresh-analytics-kpis',
  '30 21 * * *',
  $$
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
