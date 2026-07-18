-- Fixes an inflated "Active users" total in the Telegram bot and anywhere
-- else that sums analytics_active_users_per_day() across a range. That
-- function correctly returns *distinct users per day*, but a user active on
-- multiple days within the range is counted once per day they showed up, so
-- summing the daily rows overcounts anyone active more than one day in the
-- window (e.g. active yesterday and today shows as 2 users, not 1).
--
-- Adds analytics_active_users_total(), which counts distinct users active at
-- any point across the whole window in one shot, using the same three event
-- sources (chat messages, trust ledger, pool joins) as the per-day function
-- for consistency.

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
  SELECT count(DISTINCT user_id)::bigint
  FROM events
  WHERE created_at >= now() - (days_back || ' days')::interval;
$$;

GRANT EXECUTE ON FUNCTION analytics_active_users_total(int) TO service_role;
