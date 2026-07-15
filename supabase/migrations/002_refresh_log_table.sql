-- Powers the "last refreshed" badge in the dashboard header. Never
-- hardcoded: the nightly cron job (010_pg_cron_schedule.sql) upserts a row
-- here every time it runs, and lib/db/kpi.ts reads it at request time.
CREATE TABLE IF NOT EXISTS analytics_refresh_log (
  view_name text PRIMARY KEY,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
