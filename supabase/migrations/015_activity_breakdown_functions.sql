-- Multi-row breakdown queries backing the new Overview widgets and the
-- Growth/Activation/Engagement/Retention dashboards. Implemented as SQL
-- functions (not materialized views) since they're parameterized and
-- called live via supabase-js .rpc() from the service-role client, doing
-- the aggregation in Postgres rather than pulling raw rows over HTTP.
--
-- These have no dedicated app-analytics event log to draw on (no
-- session/screen-view tracking exists anywhere in this schema), so
-- "active" here is a proxy: a user counts as active on a given day if
-- they sent a chat message, recorded a trust action, or joined a pool
-- that day. Real, but not the same thing as a session/app-open event.

CREATE OR REPLACE FUNCTION analytics_new_users_per_day(days_back int DEFAULT 14)
RETURNS TABLE(day date, new_users bigint)
LANGUAGE sql STABLE AS $$
  SELECT date_trunc('day', created_at)::date AS day, count(*)::bigint
  FROM users
  WHERE is_bot = false AND created_at >= now() - (days_back || ' days')::interval
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION analytics_active_users_per_day(days_back int DEFAULT 14)
RETURNS TABLE(day date, active_users bigint)
LANGUAGE sql STABLE AS $$
  WITH events AS (
    SELECT sender_id AS user_id, created_at FROM chat_messages WHERE sender_id IS NOT NULL
    UNION ALL
    SELECT user_id, created_at FROM trust_ledger
    UNION ALL
    SELECT user_id, joined_at AS created_at FROM pool_participants
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
    SELECT created_at FROM chat_messages WHERE created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT created_at FROM trust_ledger WHERE created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT joined_at AS created_at FROM pool_participants WHERE joined_at >= now() - (days_back || ' days')::interval
  )
  SELECT extract(hour FROM created_at)::int AS hour_of_day, count(*)::bigint
  FROM events
  GROUP BY 1
  ORDER BY 1;
$$;

-- users.location and colleges.location are both `geography` (confirmed via
-- information_schema), so ST_DWithin takes a plain meter radius, no casts needed.
CREATE OR REPLACE FUNCTION analytics_active_users_near_colleges(radius_km numeric DEFAULT 5, days_back int DEFAULT 30)
RETURNS TABLE(college_name text, active_users bigint)
LANGUAGE sql STABLE AS $$
  SELECT c.name, count(DISTINCT u.id)::bigint
  FROM colleges c
  JOIN users u
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
  FROM pool_participants WHERE joined_at >= now() - (days_back || ' days')::interval
  UNION ALL
  SELECT 'Chat', count(DISTINCT sender_id)
  FROM chat_messages WHERE sender_id IS NOT NULL AND created_at >= now() - (days_back || ' days')::interval
  UNION ALL
  SELECT 'Trust actions', count(DISTINCT user_id)
  FROM trust_ledger WHERE created_at >= now() - (days_back || ' days')::interval
  UNION ALL
  SELECT 'Housing (flat leads)', count(DISTINCT tenant_id)
  FROM flat_leads WHERE created_at >= now() - (days_back || ' days')::interval
  UNION ALL
  SELECT 'Referral links', count(DISTINCT user_id)
  FROM user_rental_campaign_attributions WHERE created_at >= now() - (days_back || ' days')::interval
  ORDER BY 2 DESC;
$$;

-- Signup-to-first-action funnel for users who joined in the last `days_back` days.
CREATE OR REPLACE FUNCTION analytics_activation_funnel(days_back int DEFAULT 30)
RETURNS TABLE(stage text, user_count bigint)
LANGUAGE sql STABLE AS $$
  WITH cohort AS (
    SELECT id FROM users WHERE is_bot = false AND created_at >= now() - (days_back || ' days')::interval
  )
  SELECT 'Signed up'::text, count(*)::bigint FROM cohort
  UNION ALL
  SELECT 'Verified', count(*)::bigint
  FROM cohort c JOIN users u ON u.id = c.id WHERE u.is_verified = true
  UNION ALL
  SELECT 'Joined a pool', count(DISTINCT pp.user_id)::bigint
  FROM cohort c JOIN pool_participants pp ON pp.user_id = c.id
  UNION ALL
  SELECT 'Sent a chat message', count(DISTINCT cm.sender_id)::bigint
  FROM cohort c JOIN chat_messages cm ON cm.sender_id = c.id;
$$;

-- Weekly signup cohorts vs. proxy-activity retention in each of the following 4 weeks.
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
    FROM users
    WHERE is_bot = false AND created_at >= now() - (weeks_back || ' weeks')::interval
  ),
  events AS (
    SELECT sender_id AS user_id, created_at FROM chat_messages WHERE sender_id IS NOT NULL
    UNION ALL
    SELECT user_id, created_at FROM trust_ledger
    UNION ALL
    SELECT user_id, joined_at AS created_at FROM pool_participants
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

GRANT EXECUTE ON FUNCTION analytics_new_users_per_day(int) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_active_users_per_day(int) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_activity_by_hour(int) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_active_users_near_colleges(numeric, int) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_feature_adoption(int) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_activation_funnel(int) TO service_role;
GRANT EXECUTE ON FUNCTION analytics_retention_cohorts(int) TO service_role;
