-- New User Activity: show which pool a chat message was sent in.
--
-- The "Chat message" detail previously showed just chat_messages.type
-- (always "text" — not useful). Instead show the pool the message was
-- sent in: chat_messages.room_id -> chat_rooms.id -> chat_rooms.pool_id
-- -> pools.id, using pools.title as the name. chat_rooms can also be a
-- direct-message room (pool_id NULL), in which case we fall back to the
-- room's own name, or "Direct message".
--
-- Joins use the dedup.* views (one row per production id) so a duplicated
-- chat_rooms/pools snapshot can't multiply a chat message into several
-- detail rows. The `detail` column already renders as-is in both the
-- dashboard's per-user detail table and the CSV export, so no app change
-- is needed. Signature unchanged from migration 030 -> CREATE OR REPLACE.

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
  )
  SELECT c.id, c.name, c.phone, c.created_at, a.activity_type, a.occurred_at, a.detail
  FROM activity a
  JOIN cohort c ON c.id = a.user_id
  ORDER BY a.occurred_at DESC
  LIMIT row_limit;
$$;

GRANT EXECUTE ON FUNCTION analytics_new_user_activity_detail(int, int) TO service_role;
