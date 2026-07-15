-- Growth KPIs (powers the Overview tab). Bot accounts (users.is_bot = true)
-- are excluded from all counts so the automated virtual-user/bot system
-- doesn't inflate real growth numbers.
CREATE MATERIALIZED VIEW mv_growth_kpis AS
SELECT
  (SELECT count(*) FROM users WHERE is_bot = false) AS total_users,
  (SELECT count(*) FROM users WHERE is_bot = false AND created_at >= now() - interval '7 days') AS new_users_last_7_days,
  (SELECT count(*) FROM users WHERE is_bot = false AND created_at >= now() - interval '30 days') AS new_users_last_30_days,
  (SELECT count(*) FROM users WHERE is_bot = false AND is_verified = true) AS verified_users,
  (SELECT count(DISTINCT user_id) FROM user_colleges WHERE verification_status = 'verified') AS verified_college_users,
  (SELECT count(*) FROM colleges WHERE is_active = true) AS active_colleges,
  (SELECT count(*) FROM college_requests WHERE status = 'pending') AS pending_college_requests,
  (SELECT count(DISTINCT user_id) FROM devices WHERE is_active = true AND last_seen >= now() - interval '30 days') AS active_devices_last_30_days,
  (SELECT round(avg(trust_score)::numeric, 1) FROM users WHERE is_bot = false) AS avg_trust_score,
  (SELECT count(*) FROM users WHERE is_bot = false AND is_banned = true) AS banned_users;

CREATE UNIQUE INDEX ON mv_growth_kpis ((1));
GRANT SELECT ON mv_growth_kpis TO analytics_readonly;
