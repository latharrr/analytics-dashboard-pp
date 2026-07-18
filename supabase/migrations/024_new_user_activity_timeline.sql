-- New-user activity timeline: for users who signed up in the last N days
-- ("new users"), what activity did they do and when. Two functions:
--
-- analytics_new_user_activity_summary(days_back) — per-activity-type counts
-- (cohort size, "did any activity" distinct total, and each activity type),
-- for the headline numbers.
--
-- analytics_new_user_activity_detail(days_back, row_limit) — one row per
-- (user, activity, timestamp) event, most recent first, for the detailed
-- dashboard table / CSV export.
--
-- Both bot-excluded (migration 020) and both scope the activity itself to
-- the same days_back window as the cohort, not just "ever done, by someone
-- who happens to be new."

CREATE OR REPLACE FUNCTION analytics_new_user_activity_summary(days_back int DEFAULT 7)
RETURNS TABLE(activity text, user_count bigint)
LANGUAGE sql STABLE AS $$
  WITH cohort AS (
    SELECT id FROM dedup.users
    WHERE is_bot = false AND created_at >= now() - (days_back || ' days')::interval
  ),
  chat AS (
    SELECT DISTINCT cm.sender_id AS user_id
    FROM dedup.chat_messages cm JOIN cohort c ON c.id = cm.sender_id
    WHERE cm.sender_id IS NOT NULL AND cm.created_at >= now() - (days_back || ' days')::interval
  ),
  trust AS (
    SELECT DISTINCT tl.user_id
    FROM dedup.trust_ledger tl JOIN cohort c ON c.id = tl.user_id
    WHERE tl.created_at >= now() - (days_back || ' days')::interval
  ),
  joined AS (
    SELECT DISTINCT pp.user_id
    FROM dedup.pool_participants pp JOIN cohort c ON c.id = pp.user_id
    WHERE pp.joined_at >= now() - (days_back || ' days')::interval
  ),
  created AS (
    SELECT DISTINCT p.creator_id AS user_id
    FROM dedup.pools p JOIN cohort c ON c.id = p.creator_id
    WHERE p.created_at >= now() - (days_back || ' days')::interval
  ),
  any_activity AS (
    SELECT user_id FROM chat
    UNION SELECT user_id FROM trust
    UNION SELECT user_id FROM joined
    UNION SELECT user_id FROM created
  )
  SELECT 'New users (cohort)'::text, (SELECT count(*) FROM cohort)::bigint
  UNION ALL SELECT 'Did any activity', (SELECT count(*) FROM any_activity)::bigint
  UNION ALL SELECT 'Sent a chat message', (SELECT count(*) FROM chat)::bigint
  UNION ALL SELECT 'Joined a pool', (SELECT count(*) FROM joined)::bigint
  UNION ALL SELECT 'Created a pool', (SELECT count(*) FROM created)::bigint
  UNION ALL SELECT 'Trust action', (SELECT count(*) FROM trust)::bigint;
$$;

GRANT EXECUTE ON FUNCTION analytics_new_user_activity_summary(int) TO service_role;

CREATE OR REPLACE FUNCTION analytics_new_user_activity_detail(days_back int DEFAULT 7, row_limit int DEFAULT 500)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  signed_up_at timestamptz,
  activity_type text,
  occurred_at timestamptz,
  detail text
)
LANGUAGE sql STABLE AS $$
  WITH cohort AS (
    SELECT id, name, created_at FROM dedup.users
    WHERE is_bot = false AND created_at >= now() - (days_back || ' days')::interval
  ),
  activity AS (
    SELECT cm.sender_id AS user_id, 'Chat message'::text AS activity_type, cm.created_at AS occurred_at, cm.type::text AS detail
    FROM dedup.chat_messages cm JOIN cohort c ON c.id = cm.sender_id
    WHERE cm.sender_id IS NOT NULL AND cm.created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT tl.user_id, 'Trust action', tl.created_at, tl.reason
    FROM dedup.trust_ledger tl JOIN cohort c ON c.id = tl.user_id
    WHERE tl.created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT pp.user_id, 'Joined a pool', pp.joined_at, p.category
    FROM dedup.pool_participants pp
    JOIN cohort c ON c.id = pp.user_id
    JOIN dedup.pools p ON p.id = pp.pool_id
    WHERE pp.joined_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT p.creator_id, 'Created a pool', p.created_at, p.category
    FROM dedup.pools p JOIN cohort c ON c.id = p.creator_id
    WHERE p.created_at >= now() - (days_back || ' days')::interval
  )
  SELECT c.id, c.name, c.created_at, a.activity_type, a.occurred_at, a.detail
  FROM activity a
  JOIN cohort c ON c.id = a.user_id
  ORDER BY a.occurred_at DESC
  LIMIT row_limit;
$$;

GRANT EXECUTE ON FUNCTION analytics_new_user_activity_detail(int, int) TO service_role;
