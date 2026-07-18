-- New metric: of users who signed up in the last N days ("new users"), how
-- many have created at least one Ask Around pool (pools.category =
-- 'ask_around')? Returns both the cohort size and the conversion count so
-- the caller can show a percentage, same shape as the activation funnel.
-- Bot accounts excluded, same as the rest of the "active users" family
-- (migration 020).

CREATE OR REPLACE FUNCTION analytics_ask_around_by_new_users(days_back int DEFAULT 7)
RETURNS TABLE(new_users bigint, ask_around_creators bigint)
LANGUAGE sql STABLE AS $$
  WITH cohort AS (
    SELECT id FROM dedup.users
    WHERE is_bot = false AND created_at >= now() - (days_back || ' days')::interval
  )
  SELECT
    (SELECT count(*) FROM cohort)::bigint AS new_users,
    (
      SELECT count(DISTINCT p.creator_id)
      FROM dedup.pools p
      JOIN cohort c ON c.id = p.creator_id
      WHERE p.category = 'ask_around'
    )::bigint AS ask_around_creators;
$$;

GRANT EXECUTE ON FUNCTION analytics_ask_around_by_new_users(int) TO service_role;
