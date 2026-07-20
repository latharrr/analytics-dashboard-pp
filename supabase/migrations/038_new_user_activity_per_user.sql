-- New User Activity: return ONE ROW PER USER (events aggregated into jsonb),
-- not one row per event.
--
-- Two problems with the per-event shape (migration 036):
--   1. Correctness: PostgREST caps every response at 1000 rows. On an active
--      window a handful of power users generate 1000+ events, so a single
--      call returned ~1000 events belonging to only ~13-21 users — the table
--      showed 21 users while the "Did any activity" tile said 320+. Paging
--      past the cap fixed the count but…
--   2. Performance: …paging re-runs this expensive 7-way UNION once per
--      1000-event page — measured 7d=12s, 15d=24s, 30d=47s, so wider windows
--      timed out and rendered blank.
--
-- Grouping by user collapses the result to one row per active user (≤ the
-- user cap, i.e. ≤500 for the dashboard), so the whole thing is a single
-- ~3s call with the UNION executed once, and every active user's complete
-- activity is preserved in the `events` jsonb array. The app flattens that
-- back into the existing per-event shape, so the API/table are unchanged.
--
-- `user_limit` caps USERS (most-recently-active first), same intent as 036.

CREATE OR REPLACE FUNCTION analytics_new_user_activity_by_user(days_back int DEFAULT 7, user_limit int DEFAULT 500)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  phone text,
  signed_up_at timestamptz,
  last_activity_at timestamptz,
  activity_count bigint,
  events jsonb
)
LANGUAGE sql STABLE AS $$
  WITH cohort AS (
    SELECT id, name, phone, created_at FROM dedup.users
    WHERE is_bot = false AND created_at >= now() - (days_back || ' days')::interval
  ),
  activity AS (
    SELECT
      cm.sender_id AS user_id,
      'Chat message'::text AS activity_type,
      cm.created_at AS occurred_at,
      CASE
        WHEN cr.pool_id IS NOT NULL
          THEN 'Pool: ' || COALESCE(NULLIF(p.title, ''), NULLIF(p.category, ''), '(untitled pool)')
        ELSE COALESCE(NULLIF(cr.name, ''), 'Direct message')
      END AS detail
    FROM dedup.chat_messages cm
    JOIN cohort c ON c.id = cm.sender_id
    LEFT JOIN dedup.chat_rooms cr ON cr.id = cm.room_id
    LEFT JOIN dedup.pools p ON p.id = cr.pool_id
    WHERE cm.sender_id IS NOT NULL AND cm.created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT tl.user_id, 'Trust action', tl.created_at, tl.reason
    FROM dedup.trust_ledger tl JOIN cohort c ON c.id = tl.user_id
    WHERE tl.created_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT pp.user_id, 'Joined a pool', pp.joined_at,
      'Pool: ' || COALESCE(NULLIF(p.title, ''), NULLIF(p.category, ''), '(untitled pool)')
    FROM dedup.pool_participants pp
    JOIN cohort c ON c.id = pp.user_id
    JOIN dedup.pools p ON p.id = pp.pool_id
    WHERE pp.joined_at >= now() - (days_back || ' days')::interval
    UNION ALL
    SELECT p.creator_id, 'Created a pool', p.created_at,
      'Pool: ' || COALESCE(NULLIF(p.title, ''), NULLIF(p.category, ''), '(untitled pool)')
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
  ),
  per_user AS (
    SELECT
      a.user_id,
      max(a.occurred_at) AS last_activity_at,
      count(*)::bigint AS activity_count,
      jsonb_agg(
        jsonb_build_object('activity_type', a.activity_type, 'occurred_at', a.occurred_at, 'detail', a.detail)
        ORDER BY a.occurred_at DESC
      ) AS events
    FROM activity a
    GROUP BY a.user_id
  ),
  top_users AS (
    SELECT * FROM per_user
    ORDER BY last_activity_at DESC
    LIMIT GREATEST(user_limit, 1)
  )
  SELECT c.id, c.name, c.phone, c.created_at, tu.last_activity_at, tu.activity_count, tu.events
  FROM top_users tu
  JOIN cohort c ON c.id = tu.user_id
  ORDER BY tu.last_activity_at DESC;
$$;

GRANT EXECUTE ON FUNCTION analytics_new_user_activity_by_user(int, int) TO service_role;
