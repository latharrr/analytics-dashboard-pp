-- New User Activity detail: cap by USERS, not events.
--
-- Before, analytics_new_user_activity_detail() returned the `row_limit`
-- (500) most-recent *events*, which the dashboard then grouped into
-- users. On an active day that 500-event budget is consumed by a handful
-- of power users in a single evening (e.g. 500 events spanning only ~7
-- hours of one day), so the table only ever showed users active in that
-- narrow window — everyone active earlier in the week was truncated off
-- the page even though they're counted in the summary tiles.
--
-- Now `row_limit` means "number of users": take the N most-recently-
-- active users in the window and return ALL of their events. The table
-- then shows every active user (newest activity first), and each user's
-- activity count is complete rather than clipped. Since only a few
-- hundred new users are active in a typical window, the default 500
-- comfortably shows all of them.
--
-- Same body as migration 035 (chat shows pool name, etc.); only the
-- final SELECT changes. Signature unchanged -> CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION analytics_new_user_activity_detail(days_back int DEFAULT 7, row_limit int DEFAULT 500)
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
  top_users AS (
    SELECT a.user_id, max(a.occurred_at) AS last_at
    FROM activity a
    GROUP BY a.user_id
    ORDER BY last_at DESC
    LIMIT row_limit
  )
  SELECT c.id, c.name, c.phone, c.created_at, a.activity_type, a.occurred_at, a.detail
  FROM activity a
  JOIN top_users tu ON tu.user_id = a.user_id
  JOIN cohort c ON c.id = a.user_id
  ORDER BY tu.last_at DESC, a.occurred_at DESC;
$$;

GRANT EXECUTE ON FUNCTION analytics_new_user_activity_detail(int, int) TO service_role;
