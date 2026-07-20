-- Two fixes to New User Activity (migration 024):
--
-- 1. Adds `phone` to analytics_new_user_activity_detail(), so the
--    dashboard table (and its CSV export) can show a contact number per
--    user alongside their activity, same as PG/Flat Leads, New User
--    Locations, and Verified Users already do.
--
-- 2. PG search submissions, Flat listings, and Flatmate listings were
--    entirely missing from this timeline — the only pool-related signals
--    tracked were generic "Joined a pool" / "Created a pool" (any
--    category), and pg_hunt_queries isn't a pool at all so it was never
--    covered by any branch. Reuses the exact join logic already proven in
--    analytics_pg_flat_leads (migration 025) as three more activity
--    branches: 'PG search', 'Flat listing', 'Flatmate listing'. The
--    existing generic "Created a pool" branch is left as-is (still fires
--    for flat/flatmate pool creation too, same as before) — these are
--    additive, more specific labels, not a replacement.
--
-- Both functions' new branches also feed into `any_activity` /
-- analytics_new_user_activity_summary()'s "Did any activity" count, which
-- undercounted before: a user who only ever submitted a PG search had no
-- row in any of the four original signal tables.
--
-- pg_hunt_queries has no dedup.* view (migration 018 didn't cover it) but
-- has zero duplicate rows (confirmed in migration 025), so it's queried
-- directly from public, same as migration 025 does.

DROP FUNCTION IF EXISTS analytics_new_user_activity_detail(int, int);

CREATE FUNCTION analytics_new_user_activity_detail(days_back int DEFAULT 7, row_limit int DEFAULT 500)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  phone text,
  signed_up_at timestamptz,
  activity_type text,
  occurred_at timestamptz,
  detail text
)
LANGUAGE sql STABLE AS $$
  WITH cohort AS (
    SELECT id, name, phone, created_at FROM dedup.users
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
    UNION ALL
    SELECT phq.user_id, 'PG search', phq.created_at, concat_ws(
      ' · ',
      'Budget: ' || COALESCE(phq.budget_range, phq.max_budget::text),
      'Landing: ' || phq.landing_time,
      'Sharing: ' || array_to_string(phq.sharing_pref, ', ')
    )
    FROM public.pg_hunt_queries phq JOIN cohort c ON c.id = phq.user_id
    WHERE phq.created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT pf.created_by, 'Flat listing', pf.created_at, concat_ws(
      ' · ',
      NULLIF(pf.bhk_type, ''),
      'Rent: ' || COALESCE(pf.rent::text, 'n/a'),
      'Furnishing: ' || COALESCE(pf.furnishing, 'n/a')
    )
    FROM dedup.pool_flat pf JOIN cohort c ON c.id = pf.created_by
    WHERE pf.created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT p.creator_id, 'Flatmate listing', pfm.created_at, concat_ws(
      ' · ',
      'City: ' || COALESCE(pfm.city, 'n/a'),
      'Budget: ' || COALESCE(pfm.target_budget::text, 'n/a'),
      'Urgency: ' || COALESCE(pfm.urgency_level::text, 'n/a')
    )
    FROM dedup.pool_flatmate pfm
    JOIN dedup.pools p ON p.id = pfm.pool_id
    JOIN cohort c ON c.id = p.creator_id
    WHERE pfm.created_at >= now() - (days_back || ' days')::interval
  )
  SELECT c.id, c.name, c.phone, c.created_at, a.activity_type, a.occurred_at, a.detail
  FROM activity a
  JOIN cohort c ON c.id = a.user_id
  ORDER BY a.occurred_at DESC
  LIMIT row_limit;
$$;

GRANT EXECUTE ON FUNCTION analytics_new_user_activity_detail(int, int) TO service_role;

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
  pg_search AS (
    SELECT DISTINCT phq.user_id
    FROM public.pg_hunt_queries phq JOIN cohort c ON c.id = phq.user_id
    WHERE phq.created_at >= now() - (days_back || ' days')::interval
  ),
  flat_listing AS (
    SELECT DISTINCT pf.created_by AS user_id
    FROM dedup.pool_flat pf JOIN cohort c ON c.id = pf.created_by
    WHERE pf.created_at >= now() - (days_back || ' days')::interval
  ),
  flatmate_listing AS (
    SELECT DISTINCT p.creator_id AS user_id
    FROM dedup.pool_flatmate pfm
    JOIN dedup.pools p ON p.id = pfm.pool_id
    JOIN cohort c ON c.id = p.creator_id
    WHERE pfm.created_at >= now() - (days_back || ' days')::interval
  ),
  any_activity AS (
    SELECT user_id FROM chat
    UNION SELECT user_id FROM trust
    UNION SELECT user_id FROM joined
    UNION SELECT user_id FROM created
    UNION SELECT user_id FROM pg_search
    UNION SELECT user_id FROM flat_listing
    UNION SELECT user_id FROM flatmate_listing
  )
  SELECT 'New users (cohort)'::text, (SELECT count(*) FROM cohort)::bigint
  UNION ALL SELECT 'Did any activity', (SELECT count(*) FROM any_activity)::bigint
  UNION ALL SELECT 'Sent a chat message', (SELECT count(*) FROM chat)::bigint
  UNION ALL SELECT 'Joined a pool', (SELECT count(*) FROM joined)::bigint
  UNION ALL SELECT 'Created a pool', (SELECT count(*) FROM created)::bigint
  UNION ALL SELECT 'Trust action', (SELECT count(*) FROM trust)::bigint
  UNION ALL SELECT 'PG search', (SELECT count(*) FROM pg_search)::bigint
  UNION ALL SELECT 'Flat listing', (SELECT count(*) FROM flat_listing)::bigint
  UNION ALL SELECT 'Flatmate listing', (SELECT count(*) FROM flatmate_listing)::bigint;
$$;

GRANT EXECUTE ON FUNCTION analytics_new_user_activity_summary(int) TO service_role;
