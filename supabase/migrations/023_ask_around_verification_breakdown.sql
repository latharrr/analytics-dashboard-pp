-- Adds a verification breakdown (Digilocker only / college ID only / both /
-- neither) for users who created an Ask Around pool, plus a separate,
-- informational bot-creator count (bots are still excluded from the human
-- breakdown itself, consistent with migration 020 — this is just visibility
-- into how many bot accounts also created one).
--
-- "Verified via Digilocker" = has a row in digilocker_accounts (same
-- existence check mv_trust_kpis.digilocker_linked_accounts uses).
-- "Verified via college ID" = has a user_colleges row with
-- verification_status = 'verified' (same definition as
-- mv_growth_kpis.verified_college_users).

-- All-time: breakdown for every user who has ever created an Ask Around pool.
CREATE OR REPLACE FUNCTION analytics_ask_around_creator_verification()
RETURNS TABLE(
  creators bigint,
  verified_digilocker_only bigint,
  verified_college_only bigint,
  verified_both bigint,
  verified_neither bigint,
  bot_creators bigint
)
LANGUAGE sql STABLE AS $$
  WITH creators AS (
    SELECT DISTINCT p.creator_id AS user_id
    FROM dedup.pools p
    WHERE p.category = 'ask_around' AND p.creator_id IS NOT NULL
  ),
  human_creators AS (
    SELECT c.user_id FROM creators c
    JOIN dedup.users u ON u.id = c.user_id AND u.is_bot = false
  ),
  dg AS (SELECT DISTINCT user_id FROM dedup.digilocker_accounts),
  cv AS (SELECT DISTINCT user_id FROM dedup.user_colleges WHERE verification_status = 'verified')
  SELECT
    (SELECT count(*) FROM human_creators)::bigint,
    (
      SELECT count(*) FROM human_creators hc
      WHERE EXISTS (SELECT 1 FROM dg WHERE dg.user_id = hc.user_id)
        AND NOT EXISTS (SELECT 1 FROM cv WHERE cv.user_id = hc.user_id)
    )::bigint,
    (
      SELECT count(*) FROM human_creators hc
      WHERE EXISTS (SELECT 1 FROM cv WHERE cv.user_id = hc.user_id)
        AND NOT EXISTS (SELECT 1 FROM dg WHERE dg.user_id = hc.user_id)
    )::bigint,
    (
      SELECT count(*) FROM human_creators hc
      WHERE EXISTS (SELECT 1 FROM dg WHERE dg.user_id = hc.user_id)
        AND EXISTS (SELECT 1 FROM cv WHERE cv.user_id = hc.user_id)
    )::bigint,
    (
      SELECT count(*) FROM human_creators hc
      WHERE NOT EXISTS (SELECT 1 FROM dg WHERE dg.user_id = hc.user_id)
        AND NOT EXISTS (SELECT 1 FROM cv WHERE cv.user_id = hc.user_id)
    )::bigint,
    (
      SELECT count(DISTINCT c.user_id) FROM creators c
      JOIN dedup.users u ON u.id = c.user_id AND u.is_bot = true
    )::bigint;
$$;

GRANT EXECUTE ON FUNCTION analytics_ask_around_creator_verification() TO service_role;

-- Windowed: same breakdown, but scoped to the "new users" cohort from
-- analytics_ask_around_by_new_users (migration 022). Signature changes
-- (more output columns), so the function must be dropped and recreated
-- rather than CREATE OR REPLACE'd.
DROP FUNCTION IF EXISTS analytics_ask_around_by_new_users(int);

CREATE FUNCTION analytics_ask_around_by_new_users(days_back int DEFAULT 7)
RETURNS TABLE(
  new_users bigint,
  ask_around_creators bigint,
  verified_digilocker_only bigint,
  verified_college_only bigint,
  verified_both bigint,
  verified_neither bigint,
  bot_ask_around_creators bigint
)
LANGUAGE sql STABLE AS $$
  WITH cohort AS (
    SELECT id FROM dedup.users
    WHERE is_bot = false AND created_at >= now() - (days_back || ' days')::interval
  ),
  bot_cohort AS (
    SELECT id FROM dedup.users
    WHERE is_bot = true AND created_at >= now() - (days_back || ' days')::interval
  ),
  creators AS (
    SELECT DISTINCT p.creator_id AS user_id
    FROM dedup.pools p
    JOIN cohort c ON c.id = p.creator_id
    WHERE p.category = 'ask_around'
  ),
  dg AS (SELECT DISTINCT user_id FROM dedup.digilocker_accounts),
  cv AS (SELECT DISTINCT user_id FROM dedup.user_colleges WHERE verification_status = 'verified')
  SELECT
    (SELECT count(*) FROM cohort)::bigint,
    (SELECT count(*) FROM creators)::bigint,
    (
      SELECT count(*) FROM creators cr
      WHERE EXISTS (SELECT 1 FROM dg WHERE dg.user_id = cr.user_id)
        AND NOT EXISTS (SELECT 1 FROM cv WHERE cv.user_id = cr.user_id)
    )::bigint,
    (
      SELECT count(*) FROM creators cr
      WHERE EXISTS (SELECT 1 FROM cv WHERE cv.user_id = cr.user_id)
        AND NOT EXISTS (SELECT 1 FROM dg WHERE dg.user_id = cr.user_id)
    )::bigint,
    (
      SELECT count(*) FROM creators cr
      WHERE EXISTS (SELECT 1 FROM dg WHERE dg.user_id = cr.user_id)
        AND EXISTS (SELECT 1 FROM cv WHERE cv.user_id = cr.user_id)
    )::bigint,
    (
      SELECT count(*) FROM creators cr
      WHERE NOT EXISTS (SELECT 1 FROM dg WHERE dg.user_id = cr.user_id)
        AND NOT EXISTS (SELECT 1 FROM cv WHERE cv.user_id = cr.user_id)
    )::bigint,
    (
      SELECT count(DISTINCT p.creator_id) FROM dedup.pools p
      JOIN bot_cohort bc ON bc.id = p.creator_id
      WHERE p.category = 'ask_around'
    )::bigint;
$$;

GRANT EXECUTE ON FUNCTION analytics_ask_around_by_new_users(int) TO service_role;
