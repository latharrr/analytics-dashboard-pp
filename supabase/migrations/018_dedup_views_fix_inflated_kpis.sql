-- Fixes systematically inflated analytics. This Supabase project is loaded
-- from the production app's database by an external import process, and no
-- table here has a primary key or unique constraint — the import has
-- re-inserted overlapping snapshots, so nearly every row exists ~2-3x
-- (users: 20,506 raw rows vs 6,857 distinct ids; chat_messages: 70,189 vs
-- 23,931; confirmed same id + same created_at repeated, e.g. one user row
-- present 3 times verbatim). Every count()-based KPI was inflated ~3x as a
-- result (dashboard/Telegram said 4,822 new users in 30 days; the admin
-- Users Hub, reading production, said 1,872).
--
-- Fix: a `dedup` schema with one view per analytics table that keeps
-- exactly one row per production primary key — the freshest snapshot where
-- an updated_at exists to pick by — and rebuild all 7 KPI materialized
-- views and the live analytics functions on top of those views. This stays
-- correct even if the importer appends more duplicate snapshots later.
-- Deliberately NOT deleting the duplicate rows or adding unique
-- constraints here: the importer is an external process and constraints
-- could make its next run fail outright.

CREATE SCHEMA IF NOT EXISTS dedup;

-- Tables with an `id` production PK and an `updated_at` to pick the
-- freshest duplicate by.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'pools', 'chat_messages', 'chat_requests', 'college_requests',
    'colleges', 'copilot_chats', 'devices', 'digilocker_accounts',
    'dm_permissions', 'flat_leads', 'flatmate_interactions',
    'intent_questions', 'rental_campaign_conversions',
    'rental_referral_campaigns', 'trust_rules', 'user_colleges', 'vehicles',
    'vu_personas'
  ] LOOP
    EXECUTE format(
      'CREATE OR REPLACE VIEW dedup.%I AS
         SELECT DISTINCT ON (id) * FROM public.%I
         ORDER BY id, updated_at DESC NULLS LAST',
      t, t
    );
  END LOOP;
END $$;

-- Tables with an `id` production PK but no updated_at (duplicate snapshots
-- are identical, any row works).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bot_action_log', 'bot_pool_assignments', 'chat_members',
    'chat_reactions', 'chat_rooms', 'copilot_messages',
    'intent_question_responses', 'pool_buy_sell', 'pool_cab_share',
    'pool_event', 'pool_flat', 'pool_flatmate', 'pool_participants',
    'pool_ranting', 'rental_referral_clicks', 'rental_referral_links',
    'tag_categories', 'tags', 'trust_ledger',
    'user_rental_campaign_attributions', 'user_tag_affinity',
    'vu_action_log', 'vu_pool_decisions', 'vu_task_schedules'
  ] LOOP
    EXECUTE format(
      'CREATE OR REPLACE VIEW dedup.%I AS
         SELECT DISTINCT ON (id) * FROM public.%I ORDER BY id',
      t, t
    );
  END LOOP;
END $$;

-- Tables without an `id` column: dedupe on their natural production key.
CREATE OR REPLACE VIEW dedup.bot_personas AS
  SELECT DISTINCT ON (bot_id) * FROM public.bot_personas ORDER BY bot_id;
CREATE OR REPLACE VIEW dedup.kyc_gate_rules AS
  SELECT DISTINCT ON (action) * FROM public.kyc_gate_rules
  ORDER BY action, updated_at DESC NULLS LAST;
CREATE OR REPLACE VIEW dedup.pool_likes AS
  SELECT DISTINCT ON (pool_id, user_id) * FROM public.pool_likes
  ORDER BY pool_id, user_id;
CREATE OR REPLACE VIEW dedup.user_lifestyle_profiles AS
  SELECT DISTINCT ON (user_id) * FROM public.user_lifestyle_profiles
  ORDER BY user_id, updated_at DESC NULLS LAST;
CREATE OR REPLACE VIEW dedup.user_tags AS
  SELECT DISTINCT ON (user_id, tag_id) * FROM public.user_tags
  ORDER BY user_id, tag_id;

-- The analytics SQL functions run as service_role (SECURITY INVOKER via
-- supabase-js rpc), so it needs to read the dedup views. analytics_readonly
-- included for parity with its access to the underlying tables.
GRANT USAGE ON SCHEMA dedup TO service_role, analytics_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA dedup TO service_role, analytics_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA dedup
  GRANT SELECT ON TABLES TO service_role, analytics_readonly;

-- ---------------------------------------------------------------------------
-- Rebuild the 7 KPI materialized views on the dedup views. Definitions are
-- otherwise identical to migrations 003-009. The `(1)` unique indexes are
-- not recreated: they existed for REFRESH CONCURRENTLY, which migration 017
-- dropped (and which they never actually satisfied — see 017).
-- ---------------------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS mv_growth_kpis;
CREATE MATERIALIZED VIEW mv_growth_kpis AS
SELECT
  (SELECT count(*) FROM dedup.users WHERE is_bot = false) AS total_users,
  (SELECT count(*) FROM dedup.users WHERE is_bot = false AND created_at >= now() - interval '7 days') AS new_users_last_7_days,
  (SELECT count(*) FROM dedup.users WHERE is_bot = false AND created_at >= now() - interval '30 days') AS new_users_last_30_days,
  (SELECT count(*) FROM dedup.users WHERE is_bot = false AND is_verified = true) AS verified_users,
  (SELECT count(DISTINCT user_id) FROM dedup.user_colleges WHERE verification_status = 'verified') AS verified_college_users,
  (SELECT count(*) FROM dedup.colleges WHERE is_active = true) AS active_colleges,
  (SELECT count(*) FROM dedup.college_requests WHERE status = 'pending') AS pending_college_requests,
  (SELECT count(DISTINCT user_id) FROM dedup.devices WHERE is_active = true AND last_seen >= now() - interval '30 days') AS active_devices_last_30_days,
  (SELECT round(avg(trust_score)::numeric, 1) FROM dedup.users WHERE is_bot = false) AS avg_trust_score,
  (SELECT count(*) FROM dedup.users WHERE is_bot = false AND is_banned = true) AS banned_users;
GRANT SELECT ON mv_growth_kpis TO analytics_readonly;

DROP MATERIALIZED VIEW IF EXISTS mv_pool_kpis;
CREATE MATERIALIZED VIEW mv_pool_kpis AS
SELECT
  (SELECT count(*) FROM dedup.pools) AS total_pools,
  (SELECT count(*) FROM dedup.pools WHERE created_at >= now() - interval '30 days') AS new_pools_last_30_days,
  (SELECT count(*) FROM dedup.pools WHERE status = 'active') AS active_pools,
  (SELECT count(*) FROM dedup.pools WHERE status = 'closed') AS closed_pools,
  (SELECT count(*) FROM dedup.pools WHERE status = 'draft') AS draft_pools,
  (SELECT round(100.0 * count(*) FILTER (WHERE status = 'closed') / NULLIF(count(*), 0), 1) FROM dedup.pools) AS overall_completion_rate_pct,
  (
    SELECT category FROM dedup.pools
    GROUP BY category
    ORDER BY (count(*) FILTER (WHERE status = 'closed'))::numeric / NULLIF(count(*), 0) DESC
    LIMIT 1
  ) AS best_completion_category,
  (SELECT count(*) FROM dedup.pool_participants WHERE status = 'approved') AS approved_participants,
  (SELECT round(avg(participant_count)::numeric, 1) FROM dedup.pools) AS avg_participants_per_pool,
  (SELECT count(*) FROM dedup.pool_likes) AS total_likes,
  (SELECT count(*) FROM dedup.pool_flat) AS flat_listings,
  (SELECT count(*) FROM dedup.pool_flatmate) AS flatmate_listings,
  (SELECT count(*) FROM dedup.pool_cab_share) AS cab_share_listings,
  (SELECT count(*) FROM dedup.pool_event) AS events_listed,
  (SELECT count(*) FROM dedup.pool_buy_sell) AS buy_sell_listings,
  (SELECT count(*) FROM dedup.pool_ranting) AS rants,
  (SELECT count(*) FROM dedup.vehicles) AS registered_vehicles;
GRANT SELECT ON mv_pool_kpis TO analytics_readonly;

DROP MATERIALIZED VIEW IF EXISTS mv_chat_kpis;
CREATE MATERIALIZED VIEW mv_chat_kpis AS
SELECT
  (SELECT count(*) FROM dedup.chat_rooms) AS total_rooms,
  (SELECT count(*) FROM dedup.chat_messages WHERE is_deleted = false) AS total_messages,
  (SELECT count(*) FROM dedup.chat_messages WHERE is_deleted = false AND created_at >= now() - interval '7 days') AS messages_last_7_days,
  (SELECT count(*) FROM dedup.chat_messages WHERE is_deleted = false AND created_at >= now() - interval '30 days') AS messages_last_30_days,
  (SELECT count(*) FROM dedup.chat_members WHERE status = 'active') AS active_memberships,
  (SELECT count(*) FROM dedup.chat_reactions) AS total_reactions,
  (SELECT count(*) FROM dedup.chat_requests WHERE status = 'pending') AS pending_chat_requests,
  (SELECT count(*) FROM dedup.chat_requests WHERE status = 'approved') AS approved_chat_requests,
  (SELECT count(*) FROM dedup.dm_permissions WHERE status = 'approved') AS approved_dm_permissions,
  (SELECT count(*) FROM dedup.dm_permissions WHERE status = 'blocked') AS blocked_dm_permissions,
  (
    SELECT round(avg(sub.cnt)::numeric, 1)
    FROM (SELECT room_id, count(*) AS cnt FROM dedup.chat_messages WHERE is_deleted = false GROUP BY room_id) sub
  ) AS avg_messages_per_room;
GRANT SELECT ON mv_chat_kpis TO analytics_readonly;

DROP MATERIALIZED VIEW IF EXISTS mv_trust_kpis;
CREATE MATERIALIZED VIEW mv_trust_kpis AS
SELECT
  (SELECT count(*) FROM dedup.trust_ledger) AS total_trust_actions,
  (SELECT count(DISTINCT user_id) FROM dedup.trust_ledger) AS users_with_trust_activity,
  (
    SELECT round(count(*)::numeric / NULLIF(count(DISTINCT user_id), 0), 2)
    FROM dedup.trust_ledger
  ) AS avg_trust_actions_per_active_user,
  (SELECT round(sum(points)::numeric, 0) FROM dedup.trust_ledger) AS total_points_awarded,
  (SELECT count(*) FROM dedup.trust_rules WHERE is_active = true) AS active_trust_rules,
  (SELECT count(*) FROM dedup.kyc_gate_rules WHERE requires_kyc = true) AS kyc_required_actions,
  (SELECT count(*) FROM dedup.digilocker_accounts) AS digilocker_linked_accounts;
GRANT SELECT ON mv_trust_kpis TO analytics_readonly;

DROP MATERIALIZED VIEW IF EXISTS mv_monetization_kpis;
CREATE MATERIALIZED VIEW mv_monetization_kpis AS
SELECT
  (SELECT count(*) FROM dedup.rental_referral_clicks) AS total_clicks,
  (SELECT count(*) FROM dedup.rental_referral_clicks WHERE clicked_at >= now() - interval '30 days') AS clicks_last_30_days,
  (SELECT count(*) FROM dedup.rental_referral_campaigns WHERE is_active = true) AS active_campaigns,
  (SELECT count(*) FROM dedup.rental_referral_links WHERE disabled_at IS NULL) AS active_links,
  (SELECT count(*) FROM dedup.rental_campaign_conversions) AS total_conversions,
  (SELECT count(*) FROM dedup.rental_campaign_conversions WHERE status = 'paid') AS paid_conversions,
  (SELECT round(sum(amount)::numeric, 2) FROM dedup.rental_campaign_conversions WHERE status = 'paid') AS total_paid_amount,
  (SELECT count(*) FROM dedup.user_rental_campaign_attributions WHERE revoked_at IS NULL AND expires_at > now()) AS active_attributions,
  (SELECT count(*) FROM dedup.flat_leads) AS total_flat_leads,
  (SELECT count(*) FROM dedup.flat_leads WHERE status IN ('finalized', 'closed')) AS finalized_flat_leads,
  (
    SELECT round(
      100.0 * (SELECT count(*) FROM dedup.rental_campaign_conversions WHERE status = 'paid')
      / NULLIF((SELECT count(*) FROM dedup.rental_referral_clicks), 0),
      2
    )
  ) AS click_to_paid_rate_pct;
GRANT SELECT ON mv_monetization_kpis TO analytics_readonly;

DROP MATERIALIZED VIEW IF EXISTS mv_matching_kpis;
CREATE MATERIALIZED VIEW mv_matching_kpis AS
SELECT
  (SELECT count(*) FROM dedup.flatmate_interactions) AS total_interactions,
  (SELECT count(*) FROM dedup.flatmate_interactions WHERE created_at >= now() - interval '30 days') AS interactions_last_30_days,
  (SELECT count(*) FROM dedup.flatmate_interactions WHERE interaction_status = 'accepted') AS accepted_interactions,
  (SELECT count(*) FROM dedup.flatmate_interactions WHERE payment_status = 'captured') AS captured_payments,
  (SELECT count(*) FROM dedup.user_lifestyle_profiles) AS lifestyle_profiles_completed,
  (SELECT count(*) FROM dedup.user_tag_affinity) AS tag_affinity_signals,
  (SELECT count(*) FROM dedup.user_tags) AS user_tag_assignments,
  (SELECT count(*) FROM dedup.tags WHERE is_active = true) AS active_tags,
  (SELECT count(*) FROM dedup.tag_categories WHERE is_active = true) AS active_tag_categories,
  (SELECT count(*) FROM dedup.intent_questions WHERE is_active = true) AS active_intent_questions,
  (SELECT count(*) FROM dedup.intent_question_responses) AS intent_question_responses;
GRANT SELECT ON mv_matching_kpis TO analytics_readonly;

DROP MATERIALIZED VIEW IF EXISTS mv_ai_copilot_kpis;
CREATE MATERIALIZED VIEW mv_ai_copilot_kpis AS
SELECT
  (SELECT count(*) FROM dedup.copilot_chats) AS total_copilot_chats,
  (SELECT count(*) FROM dedup.copilot_messages) AS total_copilot_messages,
  (SELECT count(*) FROM dedup.copilot_messages WHERE created_at >= now() - interval '7 days') AS copilot_messages_last_7_days,
  (SELECT count(*) FROM dedup.vu_personas WHERE is_active = true) AS active_virtual_users,
  (SELECT count(*) FROM dedup.vu_action_log) AS total_vu_actions,
  (SELECT count(*) FROM dedup.vu_action_log WHERE created_at >= now() - interval '7 days') AS vu_actions_last_7_days,
  (SELECT count(*) FROM dedup.vu_action_log WHERE error IS NOT NULL) AS vu_action_errors,
  (SELECT count(*) FROM dedup.vu_pool_decisions) AS total_vu_pool_decisions,
  (SELECT count(*) FROM dedup.vu_task_schedules WHERE is_active = true) AS active_vu_task_schedules,
  (SELECT count(*) FROM dedup.bot_personas WHERE is_active = true) AS active_bot_personas,
  (SELECT count(*) FROM dedup.bot_action_log) AS total_bot_actions,
  (SELECT count(*) FROM dedup.bot_pool_assignments WHERE is_active = true) AS active_bot_pool_assignments;
GRANT SELECT ON mv_ai_copilot_kpis TO analytics_readonly;

-- ---------------------------------------------------------------------------
-- Repoint the live analytics functions (migration 015) at the dedup views.
-- Bodies otherwise unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION analytics_new_users_per_day(days_back int DEFAULT 14)
RETURNS TABLE(day date, new_users bigint)
LANGUAGE sql STABLE AS $$
  SELECT date_trunc('day', created_at)::date AS day, count(*)::bigint
  FROM dedup.users
  WHERE is_bot = false AND created_at >= now() - (days_back || ' days')::interval
  GROUP BY 1
  ORDER BY 1;
$$;

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
  SELECT date_trunc('day', created_at)::date AS day, count(DISTINCT user_id)::bigint
  FROM events
  WHERE created_at >= now() - (days_back || ' days')::interval
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION analytics_activity_by_hour(days_back int DEFAULT 30)
RETURNS TABLE(hour_of_day int, event_count bigint)
LANGUAGE sql STABLE AS $$
  WITH events AS (
    SELECT created_at FROM dedup.chat_messages WHERE created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT created_at FROM dedup.trust_ledger WHERE created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT joined_at AS created_at FROM dedup.pool_participants WHERE joined_at >= now() - (days_back || ' days')::interval
  )
  SELECT extract(hour FROM created_at)::int AS hour_of_day, count(*)::bigint
  FROM events
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION analytics_active_users_near_colleges(radius_km numeric DEFAULT 5, days_back int DEFAULT 30)
RETURNS TABLE(college_name text, active_users bigint)
LANGUAGE sql STABLE AS $$
  SELECT c.name, count(DISTINCT u.id)::bigint
  FROM dedup.colleges c
  JOIN dedup.users u
    ON u.location IS NOT NULL
    AND ST_DWithin(u.location, c.location, radius_km * 1000)
  WHERE u.is_bot = false AND u.last_activity >= now() - (days_back || ' days')::interval
  GROUP BY c.name
  ORDER BY 2 DESC
  LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION analytics_feature_adoption(days_back int DEFAULT 30)
RETURNS TABLE(feature text, active_users bigint)
LANGUAGE sql STABLE AS $$
  SELECT 'Pools'::text, count(DISTINCT user_id)::bigint
  FROM dedup.pool_participants WHERE joined_at >= now() - (days_back || ' days')::interval
  UNION ALL
  SELECT 'Chat', count(DISTINCT sender_id)
  FROM dedup.chat_messages WHERE sender_id IS NOT NULL AND created_at >= now() - (days_back || ' days')::interval
  UNION ALL
  SELECT 'Trust actions', count(DISTINCT user_id)
  FROM dedup.trust_ledger WHERE created_at >= now() - (days_back || ' days')::interval
  UNION ALL
  SELECT 'Housing (flat leads)', count(DISTINCT tenant_id)
  FROM dedup.flat_leads WHERE created_at >= now() - (days_back || ' days')::interval
  UNION ALL
  SELECT 'Referral links', count(DISTINCT user_id)
  FROM dedup.user_rental_campaign_attributions WHERE created_at >= now() - (days_back || ' days')::interval
  ORDER BY 2 DESC;
$$;

CREATE OR REPLACE FUNCTION analytics_activation_funnel(days_back int DEFAULT 30)
RETURNS TABLE(stage text, user_count bigint)
LANGUAGE sql STABLE AS $$
  WITH cohort AS (
    SELECT id FROM dedup.users WHERE is_bot = false AND created_at >= now() - (days_back || ' days')::interval
  )
  SELECT 'Signed up'::text, count(*)::bigint FROM cohort
  UNION ALL
  SELECT 'Verified', count(*)::bigint
  FROM cohort c JOIN dedup.users u ON u.id = c.id WHERE u.is_verified = true
  UNION ALL
  SELECT 'Joined a pool', count(DISTINCT pp.user_id)::bigint
  FROM cohort c JOIN dedup.pool_participants pp ON pp.user_id = c.id
  UNION ALL
  SELECT 'Sent a chat message', count(DISTINCT cm.sender_id)::bigint
  FROM cohort c JOIN dedup.chat_messages cm ON cm.sender_id = c.id;
$$;

CREATE OR REPLACE FUNCTION analytics_retention_cohorts(weeks_back int DEFAULT 8)
RETURNS TABLE(
  cohort_week date,
  cohort_size bigint,
  week_1_retained bigint,
  week_2_retained bigint,
  week_3_retained bigint,
  week_4_retained bigint
)
LANGUAGE sql STABLE AS $$
  WITH cohorts AS (
    SELECT id, date_trunc('week', created_at)::date AS cohort_week
    FROM dedup.users
    WHERE is_bot = false AND created_at >= now() - (weeks_back || ' weeks')::interval
  ),
  events AS (
    SELECT sender_id AS user_id, created_at FROM dedup.chat_messages WHERE sender_id IS NOT NULL
    UNION ALL
    SELECT user_id, created_at FROM dedup.trust_ledger
    UNION ALL
    SELECT user_id, joined_at AS created_at FROM dedup.pool_participants
  )
  SELECT
    c.cohort_week,
    count(DISTINCT c.id)::bigint AS cohort_size,
    count(DISTINCT e.user_id) FILTER (
      WHERE e.created_at >= c.cohort_week + interval '1 week' AND e.created_at < c.cohort_week + interval '2 weeks'
    )::bigint AS week_1_retained,
    count(DISTINCT e.user_id) FILTER (
      WHERE e.created_at >= c.cohort_week + interval '2 weeks' AND e.created_at < c.cohort_week + interval '3 weeks'
    )::bigint AS week_2_retained,
    count(DISTINCT e.user_id) FILTER (
      WHERE e.created_at >= c.cohort_week + interval '3 weeks' AND e.created_at < c.cohort_week + interval '4 weeks'
    )::bigint AS week_3_retained,
    count(DISTINCT e.user_id) FILTER (
      WHERE e.created_at >= c.cohort_week + interval '4 weeks' AND e.created_at < c.cohort_week + interval '5 weeks'
    )::bigint AS week_4_retained
  FROM cohorts c
  LEFT JOIN events e ON e.user_id = c.id
  GROUP BY c.cohort_week
  ORDER BY c.cohort_week;
$$;

-- New: DAU/WAU/MAU as a SQL function. The dashboard/bot previously did
-- three head-count queries over raw public.users from JS, which double-
-- counted duplicated user rows (DAU showed 232 vs ~77 real).
CREATE OR REPLACE FUNCTION analytics_dau_wau_mau()
RETURNS TABLE(dau bigint, wau bigint, mau bigint)
LANGUAGE sql STABLE AS $$
  SELECT
    count(*) FILTER (WHERE last_activity >= now() - interval '1 day')::bigint AS dau,
    count(*) FILTER (WHERE last_activity >= now() - interval '7 days')::bigint AS wau,
    count(*) FILTER (WHERE last_activity >= now() - interval '30 days')::bigint AS mau
  FROM dedup.users
  WHERE is_bot = false;
$$;

GRANT EXECUTE ON FUNCTION analytics_dau_wau_mau() TO service_role;
