-- New metric: how many (real, non-bot) users have engaged with the "Ask
-- Around" pool category (pools.category = 'ask_around') — either by
-- creating one themselves or by joining someone else's. All-time, no
-- day-count window, matching the existing "Top colleges" / "Pool completion
-- %" buttons (migration in the prior session) rather than the 30-day-window
-- breakdowns like Feature adoption.

CREATE OR REPLACE FUNCTION analytics_ask_around_users()
RETURNS bigint
LANGUAGE sql STABLE AS $$
  WITH ask_around_pools AS (
    SELECT id, creator_id FROM dedup.pools WHERE category = 'ask_around'
  ),
  engaged_user_ids AS (
    SELECT creator_id AS user_id FROM ask_around_pools WHERE creator_id IS NOT NULL
    UNION
    SELECT pp.user_id
    FROM dedup.pool_participants pp
    JOIN ask_around_pools ap ON ap.id = pp.pool_id
  )
  SELECT count(DISTINCT e.user_id)::bigint
  FROM engaged_user_ids e
  JOIN dedup.users u ON u.id = e.user_id AND u.is_bot = false;
$$;

GRANT EXECUTE ON FUNCTION analytics_ask_around_users() TO service_role;
