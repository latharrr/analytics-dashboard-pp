-- Engagement + retention scores on the user tables, and a per-user chat
-- room/pool drill-down for Direct Chats.
--
-- Definitions (REAL data only — no interpolation/guessing):
--   total_activities   = count of tracked events (chat, trust, pool join/create,
--                        PG search, flat/flatmate listing), deduped via dedup.*.
--   active_days        = count of DISTINCT calendar days on which the user did
--                        ANY tracked activity (active on the 17th & 19th = 2).
--   days_since_signup  = whole days between users.created_at and today (>= 1).
--   engagement_density = total_activities / active_days  (avg activities per
--                        active day; NULL when active_days = 0).
--   retention_score    = active_days / days_since_signup  (fraction of their
--                        lifetime on which they were actually active; <= 1).
--
-- Perf: the per-user aggregate over all activity tables is a single grouped
-- scan of the dedup.* views (measured ~2.6s cold / ~0.8s warm for ~1,500 active
-- users / ~71k events) — safely under the service_role timeout, and it lets the
-- table sort by activities/density/retention GLOBALLY (not just one page).

-- 1) All Users, now with engagement/retention. Additive: a NEW function name
--    (leaves the 041 analytics_all_users_detail untouched, so the live app never
--    sees a dropped function). The app switches to this one.
CREATE OR REPLACE FUNCTION analytics_all_users_engagement(
  search_text text DEFAULT NULL,
  signed_up_from timestamptz DEFAULT NULL,
  signed_up_to timestamptz DEFAULT NULL,
  last_active_from timestamptz DEFAULT NULL,
  last_active_to timestamptz DEFAULT NULL,
  activity_filter text DEFAULT 'all',
  sort_by text DEFAULT 'last_active',
  sort_dir text DEFAULT 'desc',
  page_number int DEFAULT 1,
  page_size int DEFAULT 50
)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  phone text,
  signed_up_at timestamptz,
  last_active_at timestamptz,
  trust_score numeric,
  is_verified boolean,
  is_banned boolean,
  total_activities bigint,
  active_days bigint,
  days_since_signup int,
  engagement_density numeric,
  retention_score numeric,
  last_activity_type text,
  last_activity_detail text,
  last_activity_occurred_at timestamptz,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    -- Clamp raised 200 -> 10000 so the CSV/XLSX export (getAllUsersForExport pages
    -- at 1000 rows/page) fetches the whole filtered set; a 200 clamp made the export
    -- loop stop after one short page and silently truncate to 200 users. Interactive
    -- table still requests 50/page. (Matches migration 037's clamp for the prior fn.)
    SELECT GREATEST(page_number, 1) AS pg_num, LEAST(GREATEST(page_size, 1), 10000) AS pg_size
  ),
  ev AS (
    SELECT sender_id AS uid, created_at AS ts FROM dedup.chat_messages WHERE sender_id IS NOT NULL
    UNION ALL SELECT user_id, created_at FROM dedup.trust_ledger
    UNION ALL SELECT user_id, joined_at FROM dedup.pool_participants
    UNION ALL SELECT creator_id, created_at FROM dedup.pools
    -- No dedup.pg_hunt_queries view exists (migration 018 doesn't cover it), so
    -- dedup inline by production id — otherwise the ~3x-duplicated raw rows would
    -- triple-count PG searches in total_activities and inflate engagement_density.
    UNION ALL SELECT user_id, created_at
      FROM (SELECT DISTINCT ON (id) id, user_id, created_at FROM public.pg_hunt_queries ORDER BY id) phq_dedup
    UNION ALL SELECT created_by, created_at FROM dedup.pool_flat
    UNION ALL SELECT p.creator_id, pfm.created_at
      FROM dedup.pool_flatmate pfm JOIN dedup.pools p ON p.id = pfm.pool_id
  ),
  agg AS (
    SELECT uid, count(*)::bigint AS total_activities, count(DISTINCT ts::date)::bigint AS active_days
    FROM ev WHERE uid IS NOT NULL GROUP BY uid
  ),
  base AS (
    SELECT
      u.id,
      u.name,
      u.phone,
      u.created_at,
      u.trust_score,
      u.is_verified,
      u.is_banned,
      CASE WHEN u.last_activity < '2000-01-01'::timestamptz THEN NULL ELSE u.last_activity END AS last_active,
      COALESCE(a.total_activities, 0) AS total_activities,
      COALESCE(a.active_days, 0) AS active_days,
      GREATEST(1, (now()::date - u.created_at::date)) AS days_since_signup
    FROM dedup.users u
    LEFT JOIN agg a ON a.uid = u.id
    WHERE u.is_bot = false
  ),
  calc AS (
    SELECT b.*,
      CASE WHEN b.active_days > 0
        THEN round(b.total_activities::numeric / b.active_days, 2) END AS engagement_density,
      round(b.active_days::numeric / b.days_since_signup, 3) AS retention_score
    FROM base b
  ),
  filtered AS (
    SELECT c.*, count(*) OVER ()::bigint AS total_count
    FROM calc c
    WHERE (search_text IS NULL OR c.name ILIKE '%' || search_text || '%' OR c.phone ILIKE '%' || search_text || '%')
      AND (signed_up_from IS NULL OR c.created_at >= signed_up_from)
      AND (signed_up_to IS NULL OR c.created_at <= signed_up_to)
      AND (last_active_from IS NULL OR c.last_active >= last_active_from)
      AND (last_active_to IS NULL OR c.last_active <= last_active_to)
      AND (
        activity_filter = 'all'
        OR (activity_filter = 'active' AND c.total_activities > 0)
        OR (activity_filter = 'inactive' AND c.total_activities = 0)
      )
  ),
  ranked AS (
    SELECT f.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN sort_by = 'last_active' AND sort_dir = 'asc' THEN f.last_active END ASC NULLS LAST,
          CASE WHEN sort_by = 'last_active' AND sort_dir = 'desc' THEN f.last_active END DESC NULLS LAST,
          CASE WHEN sort_by = 'signed_up' AND sort_dir = 'asc' THEN f.created_at END ASC NULLS LAST,
          CASE WHEN sort_by = 'signed_up' AND sort_dir = 'desc' THEN f.created_at END DESC NULLS LAST,
          CASE WHEN sort_by = 'name' AND sort_dir = 'asc' THEN f.name END ASC NULLS LAST,
          CASE WHEN sort_by = 'name' AND sort_dir = 'desc' THEN f.name END DESC NULLS LAST,
          CASE WHEN sort_by = 'trust_score' AND sort_dir = 'asc' THEN f.trust_score END ASC NULLS LAST,
          CASE WHEN sort_by = 'trust_score' AND sort_dir = 'desc' THEN f.trust_score END DESC NULLS LAST,
          CASE WHEN sort_by = 'activities' AND sort_dir = 'asc' THEN f.total_activities END ASC NULLS LAST,
          CASE WHEN sort_by = 'activities' AND sort_dir = 'desc' THEN f.total_activities END DESC NULLS LAST,
          CASE WHEN sort_by = 'engagement_density' AND sort_dir = 'asc' THEN f.engagement_density END ASC NULLS LAST,
          CASE WHEN sort_by = 'engagement_density' AND sort_dir = 'desc' THEN f.engagement_density END DESC NULLS LAST,
          CASE WHEN sort_by = 'retention_score' AND sort_dir = 'asc' THEN f.retention_score END ASC NULLS LAST,
          CASE WHEN sort_by = 'retention_score' AND sort_dir = 'desc' THEN f.retention_score END DESC NULLS LAST,
          f.last_active DESC NULLS LAST
      ) AS rn
    FROM filtered f
  ),
  page AS (
    SELECT r.* FROM ranked r, bounds b
    WHERE r.rn > (b.pg_num - 1) * b.pg_size AND r.rn <= b.pg_num * b.pg_size
  )
  SELECT
    pu.id, pu.name, pu.phone, pu.created_at, pu.last_active, pu.trust_score, pu.is_verified, pu.is_banned,
    pu.total_activities, pu.active_days, pu.days_since_signup, pu.engagement_density, pu.retention_score,
    la.activity_type, la.detail, la.occurred_at, pu.total_count
  FROM page pu
  LEFT JOIN LATERAL (
    SELECT e.activity_type, e.detail, e.occurred_at
    FROM (
      SELECT 'Chat message'::text AS activity_type, cm.type::text AS detail, cm.created_at AS occurred_at
      FROM public.chat_messages cm WHERE cm.sender_id = pu.id
      UNION ALL SELECT 'Trust action', tl.reason, tl.created_at FROM public.trust_ledger tl WHERE tl.user_id = pu.id
      UNION ALL SELECT 'Joined a pool', jp.category, jpp.joined_at
        FROM public.pool_participants jpp JOIN public.pools jp ON jp.id = jpp.pool_id WHERE jpp.user_id = pu.id
      UNION ALL SELECT 'Created a pool', cp.category, cp.created_at FROM public.pools cp WHERE cp.creator_id = pu.id
      UNION ALL SELECT 'PG search', concat_ws(' · ', 'Budget: ' || COALESCE(phq.budget_range, phq.max_budget::text), 'Landing: ' || phq.landing_time), phq.created_at
        FROM public.pg_hunt_queries phq WHERE phq.user_id = pu.id
      UNION ALL SELECT 'Flat listing', NULLIF(pf.bhk_type, ''), pf.created_at FROM public.pool_flat pf WHERE pf.created_by = pu.id
      UNION ALL SELECT 'Flatmate listing', 'City: ' || COALESCE(pfm.city, 'n/a'), pfm.created_at
        FROM public.pools fp JOIN public.pool_flatmate pfm ON pfm.pool_id = fp.id WHERE fp.creator_id = pu.id
    ) e
    ORDER BY e.occurred_at DESC NULLS LAST
    LIMIT 1
  ) la ON true
  ORDER BY pu.rn;
$$;

GRANT EXECUTE ON FUNCTION analytics_all_users_engagement(
  text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, int, int
) TO service_role;


-- 2) Direct Chats "By user" drill-down: the rooms (DMs + pools) a user has
--    messaged in, so the UI can list them and open one. Filters public by
--    sender_id (indexed) then DISTINCT ON (id); label tables join via dedup.*.
CREATE OR REPLACE FUNCTION analytics_chat_user_rooms(target_user uuid)
RETURNS TABLE(
  room_id uuid,
  room_kind_out text,
  label text,
  counterpart_name text,
  counterpart_phone text,
  user_msg_count bigint,
  first_message_at timestamptz,
  last_message_at timestamptz
)
LANGUAGE sql STABLE AS $$
  WITH um AS (
    SELECT DISTINCT ON (cm.id) cm.id, cm.room_id, cm.created_at
    FROM public.chat_messages cm
    WHERE cm.sender_id = target_user
    ORDER BY cm.id
  ),
  per_room AS (
    SELECT room_id, count(*)::bigint AS user_msg_count, min(created_at) AS first_at, max(created_at) AS last_at
    FROM um
    GROUP BY room_id
  )
  SELECT
    pr.room_id,
    CASE WHEN cr.pool_id IS NULL THEN 'dm' ELSE 'pool' END,
    CASE
      WHEN cr.pool_id IS NOT NULL
        THEN 'Pool: ' || COALESCE(NULLIF(p.title, ''), NULLIF(p.category, ''), '(untitled pool)')
      ELSE COALESCE(NULLIF(cr.name, ''), 'Direct message')
    END,
    other.name, other.phone,
    pr.user_msg_count, pr.first_at, pr.last_at
  FROM per_room pr
  LEFT JOIN dedup.chat_rooms cr ON cr.id = pr.room_id
  LEFT JOIN dedup.pools p ON p.id = cr.pool_id
  LEFT JOIN LATERAL (
    SELECT u2.name, u2.phone
    FROM (SELECT DISTINCT user_id FROM public.chat_members WHERE room_id = pr.room_id) mm
    JOIN dedup.users u2 ON u2.id = mm.user_id
    WHERE mm.user_id <> target_user
      AND (SELECT count(*) FROM (SELECT DISTINCT user_id FROM public.chat_members WHERE room_id = pr.room_id) d) = 2
    LIMIT 1
  ) other ON true
  ORDER BY pr.last_at DESC;
$$;

GRANT EXECUTE ON FUNCTION analytics_chat_user_rooms(uuid) TO service_role;
