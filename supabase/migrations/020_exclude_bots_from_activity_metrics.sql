-- Excludes bot/virtual-user activity from "active users" and per-user
-- activity metrics. analytics_dau_wau_mau() (migration 018) correctly
-- filters dedup.users.is_bot = false, but these functions/views computed
-- distinct users straight from event tables (chat_messages, trust_ledger,
-- pool_participants, devices, user_colleges) without ever joining back to
-- users.is_bot, so the product's bot/virtual-user accounts (vu_personas /
-- bot_personas, used to seed pool activity) were counted as active humans.
--
-- Verified against live data before this fix: "active users, last 7 days"
-- was 530 including bots vs 497 real users; feature adoption and the
-- Trust/Growth KPI tabs' "active user" counts were inflated by the same
-- ~33 bot accounts.

CREATE OR REPLACE FUNCTION analytics_active_users_per_day(days_back int DEFAULT 14)
RETURNS TABLE(day date, active_users bigint)
LANGUAGE sql STABLE AS $$
  WITH events AS (
    SELECT sender_id AS user_id, created_at FROM dedup.chat_messages WHERE sender_id IS NOT NULL
    UNION ALL
    SELECT user_id, created_at FROM dedup.trust_ledger
    UNION ALL
    SELECT user_id, joined_at AS created_at FROM dedup.pool_participants
  )
  SELECT date_trunc('day', e.created_at)::date AS day, count(DISTINCT e.user_id)::bigint
  FROM events e
  JOIN dedup.users u ON u.id = e.user_id AND u.is_bot = false
  WHERE e.created_at >= now() - (days_back || ' days')::interval
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION analytics_active_users_total(days_back int DEFAULT 14)
RETURNS bigint
LANGUAGE sql STABLE AS $$
  WITH events AS (
    SELECT sender_id AS user_id, created_at FROM dedup.chat_messages WHERE sender_id IS NOT NULL
    UNION ALL
    SELECT user_id, created_at FROM dedup.trust_ledger
    UNION ALL
    SELECT user_id, joined_at AS created_at FROM dedup.pool_participants
  )
  SELECT count(DISTINCT e.user_id)::bigint
  FROM events e
  JOIN dedup.users u ON u.id = e.user_id AND u.is_bot = false
  WHERE e.created_at >= now() - (days_back || ' days')::interval;
$$;

CREATE OR REPLACE FUNCTION analytics_activity_by_hour(days_back int DEFAULT 30)
RETURNS TABLE(hour_of_day int, event_count bigint)
LANGUAGE sql STABLE AS $$
  WITH events AS (
    SELECT sender_id AS user_id, created_at FROM dedup.chat_messages
      WHERE sender_id IS NOT NULL AND created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT user_id, created_at FROM dedup.trust_ledger
      WHERE created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT user_id, joined_at AS created_at FROM dedup.pool_participants
      WHERE joined_at >= now() - (days_back || ' days')::interval
  )
  SELECT extract(hour FROM e.created_at)::int AS hour_of_day, count(*)::bigint
  FROM events e
  JOIN dedup.users u ON u.id = e.user_id AND u.is_bot = false
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION analytics_feature_adoption(days_back int DEFAULT 30)
RETURNS TABLE(feature text, active_users bigint)
LANGUAGE sql STABLE AS $$
  SELECT 'Pools'::text, count(DISTINCT pp.user_id)::bigint
  FROM dedup.pool_participants pp JOIN dedup.users u ON u.id = pp.user_id AND u.is_bot = false
  WHERE pp.joined_at >= now() - (days_back || ' days')::interval
  UNION ALL
  SELECT 'Chat', count(DISTINCT cm.sender_id)
  FROM dedup.chat_messages cm JOIN dedup.users u ON u.id = cm.sender_id AND u.is_bot = false
  WHERE cm.sender_id IS NOT NULL AND cm.created_at >= now() - (days_back || ' days')::interval
  UNION ALL
  SELECT 'Trust actions', count(DISTINCT tl.user_id)
  FROM dedup.trust_ledger tl JOIN dedup.users u ON u.id = tl.user_id AND u.is_bot = false
  WHERE tl.created_at >= now() - (days_back || ' days')::interval
  UNION ALL
  SELECT 'Housing (flat leads)', count(DISTINCT fl.tenant_id)
  FROM dedup.flat_leads fl JOIN dedup.users u ON u.id = fl.tenant_id AND u.is_bot = false
  WHERE fl.created_at >= now() - (days_back || ' days')::interval
  UNION ALL
  SELECT 'Referral links', count(DISTINCT ura.user_id)
  FROM dedup.user_rental_campaign_attributions ura JOIN dedup.users u ON u.id = ura.user_id AND u.is_bot = false
  WHERE ura.created_at >= now() - (days_back || ' days')::interval
  ORDER BY 2 DESC;
$$;

-- mv_growth_kpis: verified_college_users and active_devices_last_30_days
-- were counting bot-owned rows. Rest of the view is unchanged from 018.
DROP MATERIALIZED VIEW IF EXISTS mv_growth_kpis;
CREATE MATERIALIZED VIEW mv_growth_kpis AS
SELECT
  (SELECT count(*) FROM dedup.users WHERE is_bot = false) AS total_users,
  (SELECT count(*) FROM dedup.users WHERE is_bot = false AND created_at >= now() - interval '7 days') AS new_users_last_7_days,
  (SELECT count(*) FROM dedup.users WHERE is_bot = false AND created_at >= now() - interval '30 days') AS new_users_last_30_days,
  (SELECT count(*) FROM dedup.users WHERE is_bot = false AND is_verified = true) AS verified_users,
  (
    SELECT count(DISTINCT uc.user_id) FROM dedup.user_colleges uc
    JOIN dedup.users u ON u.id = uc.user_id AND u.is_bot = false
    WHERE uc.verification_status = 'verified'
  ) AS verified_college_users,
  (SELECT count(*) FROM dedup.colleges WHERE is_active = true) AS active_colleges,
  (SELECT count(*) FROM dedup.college_requests WHERE status = 'pending') AS pending_college_requests,
  (
    SELECT count(DISTINCT d.user_id) FROM dedup.devices d
    JOIN dedup.users u ON u.id = d.user_id AND u.is_bot = false
    WHERE d.is_active = true AND d.last_seen >= now() - interval '30 days'
  ) AS active_devices_last_30_days,
  (SELECT round(avg(trust_score)::numeric, 1) FROM dedup.users WHERE is_bot = false) AS avg_trust_score,
  (SELECT count(*) FROM dedup.users WHERE is_bot = false AND is_banned = true) AS banned_users;
GRANT SELECT ON mv_growth_kpis TO analytics_readonly;

-- mv_trust_kpis: users_with_trust_activity and avg_trust_actions_per_active_user
-- were counting bot-owned trust_ledger rows. total_trust_actions and
-- total_points_awarded are deliberately left as-is (total system volume,
-- not a per-user stat). Rest of the view is unchanged from 018.
DROP MATERIALIZED VIEW IF EXISTS mv_trust_kpis;
CREATE MATERIALIZED VIEW mv_trust_kpis AS
SELECT
  (SELECT count(*) FROM dedup.trust_ledger) AS total_trust_actions,
  (
    SELECT count(DISTINCT tl.user_id) FROM dedup.trust_ledger tl
    JOIN dedup.users u ON u.id = tl.user_id AND u.is_bot = false
  ) AS users_with_trust_activity,
  (
    SELECT round(count(*)::numeric / NULLIF(count(DISTINCT tl.user_id), 0), 2)
    FROM dedup.trust_ledger tl
    JOIN dedup.users u ON u.id = tl.user_id AND u.is_bot = false
  ) AS avg_trust_actions_per_active_user,
  (SELECT round(sum(points)::numeric, 0) FROM dedup.trust_ledger) AS total_points_awarded,
  (SELECT count(*) FROM dedup.trust_rules WHERE is_active = true) AS active_trust_rules,
  (SELECT count(*) FROM dedup.kyc_gate_rules WHERE requires_kyc = true) AS kyc_required_actions,
  (SELECT count(*) FROM dedup.digilocker_accounts) AS digilocker_linked_accounts;
GRANT SELECT ON mv_trust_kpis TO analytics_readonly;
