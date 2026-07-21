-- Full tracked-activity timeline for a SINGLE user (all-time).
--
-- analytics_all_users_detail (034) returns each user's ONE most-recent event
-- (a LATERAL ... LIMIT 1). This function returns *every* event for one user,
-- so All Users rows and New User Activity's "All users" mode can expand to the
-- complete history — the same 7-way UNION, but without the LIMIT 1 and with the
-- richer pool-name detail from 035/038.
--
-- Per-user perf (CLAUDE.md #2): filter the big event tables in public.* by the
-- user column (uses idx_chat_messages_sender_id_created_at etc. from 032), then
-- DISTINCT ON (id) to collapse the importer's duplicate snapshots. The small
-- label tables (chat_rooms, pools) are joined by id via the dedup.* views.
-- pg_hunt_queries has no dedup view, so DISTINCT ON (id) it directly.

CREATE OR REPLACE FUNCTION analytics_user_activity_detail(target_user uuid)
RETURNS TABLE(
  activity_type text,
  occurred_at timestamptz,
  detail text
)
LANGUAGE sql STABLE AS $$
  SELECT e.activity_type, e.occurred_at, e.detail
  FROM (
    -- Chat message (pool name, or DM room name / "Direct message")
    SELECT
      'Chat message'::text AS activity_type,
      cm.created_at AS occurred_at,
      CASE
        WHEN cr.pool_id IS NOT NULL
          THEN 'Pool: ' || COALESCE(NULLIF(p.title, ''), NULLIF(p.category, ''), '(untitled pool)')
        ELSE COALESCE(NULLIF(cr.name, ''), 'Direct message')
      END AS detail
    FROM (
      SELECT DISTINCT ON (id) id, room_id, created_at
      FROM public.chat_messages
      WHERE sender_id = target_user
      ORDER BY id
    ) cm
    LEFT JOIN dedup.chat_rooms cr ON cr.id = cm.room_id
    LEFT JOIN dedup.pools p ON p.id = cr.pool_id

    UNION ALL
    SELECT 'Trust action', tl.created_at, tl.reason
    FROM (
      SELECT DISTINCT ON (id) id, created_at, reason
      FROM public.trust_ledger WHERE user_id = target_user ORDER BY id
    ) tl

    UNION ALL
    SELECT 'Joined a pool', pp.joined_at,
      'Pool: ' || COALESCE(NULLIF(p.title, ''), NULLIF(p.category, ''), '(untitled pool)')
    FROM (
      SELECT DISTINCT ON (id) id, pool_id, joined_at
      FROM public.pool_participants WHERE user_id = target_user ORDER BY id
    ) pp
    JOIN dedup.pools p ON p.id = pp.pool_id

    UNION ALL
    SELECT 'Created a pool', cp.created_at,
      'Pool: ' || COALESCE(NULLIF(cp.title, ''), NULLIF(cp.category, ''), '(untitled pool)')
    FROM (
      SELECT DISTINCT ON (id) id, title, category, created_at
      FROM public.pools WHERE creator_id = target_user ORDER BY id
    ) cp

    UNION ALL
    SELECT 'PG search', phq.created_at, concat_ws(
      ' · ',
      'Budget: ' || COALESCE(phq.budget_range, phq.max_budget::text),
      'Landing: ' || phq.landing_time,
      'Sharing: ' || array_to_string(phq.sharing_pref, ', ')
    )
    FROM (
      SELECT DISTINCT ON (id) id, budget_range, max_budget, landing_time, sharing_pref, created_at
      FROM public.pg_hunt_queries WHERE user_id = target_user ORDER BY id
    ) phq

    UNION ALL
    SELECT 'Flat listing', pf.created_at, concat_ws(
      ' · ',
      NULLIF(pf.bhk_type, ''),
      'Rent: ' || COALESCE(pf.rent::text, 'n/a'),
      'Furnishing: ' || COALESCE(pf.furnishing, 'n/a')
    )
    FROM (
      SELECT DISTINCT ON (id) id, bhk_type, rent, furnishing, created_at
      FROM public.pool_flat WHERE created_by = target_user ORDER BY id
    ) pf

    UNION ALL
    SELECT 'Flatmate listing', pfm.created_at, concat_ws(
      ' · ',
      'City: ' || COALESCE(pfm.city, 'n/a'),
      'Budget: ' || COALESCE(pfm.target_budget::text, 'n/a'),
      'Urgency: ' || COALESCE(pfm.urgency_level::text, 'n/a')
    )
    FROM (
      SELECT DISTINCT ON (fp.id) fp.id AS pool_id FROM public.pools fp WHERE fp.creator_id = target_user ORDER BY fp.id
    ) mine
    JOIN (
      SELECT DISTINCT ON (id) id, pool_id, city, target_budget, urgency_level, created_at
      FROM public.pool_flatmate ORDER BY id
    ) pfm ON pfm.pool_id = mine.pool_id
  ) e
  ORDER BY e.occurred_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION analytics_user_activity_detail(uuid) TO service_role;
