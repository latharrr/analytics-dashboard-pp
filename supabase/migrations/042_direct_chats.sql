-- Direct Chats browser: who messaged whom, when, and what.
--
-- Covers ALL chat messages — 1-on-1 DMs (chat_rooms.pool_id IS NULL,
-- type='private_dm') AND pool/group rooms — grouped two ways: by conversation
-- (room) and by user. Message text (chat_messages.content) is returned; this is
-- an internal admin tool and the exports are PII-rate-limited in the app.
--
-- Perf/dedup notes (CLAUDE.md #1,#2,#8):
--   * Grouped counts scan dedup.chat_messages (one row per id) and aggregate in
--     SQL — never raw public counts (~3x inflated), never JS aggregation.
--   * Single-room / single-user message lists filter public.chat_messages by an
--     indexed column then DISTINCT ON (id) — filtering the dedup VIEW by
--     room_id/sender_id would defeat the index.
--   * Small label/roster tables (chat_rooms, pools, users, chat_members) join
--     by id via the dedup.* views.

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id_created_at
  ON public.chat_messages (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_members_room_id ON public.chat_members (room_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON public.chat_members (user_id);


-- 1) Conversations: one row per room. --------------------------------------
CREATE OR REPLACE FUNCTION analytics_chat_conversations(
  search_text text DEFAULT NULL,
  room_kind text DEFAULT 'all',         -- all | dm | pool
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL,
  sort_by text DEFAULT 'recent',        -- recent | messages
  sort_dir text DEFAULT 'desc',
  page_number int DEFAULT 1,
  page_size int DEFAULT 50
)
RETURNS TABLE(
  room_id uuid,
  room_kind_out text,
  label text,
  pool_title text,
  participants jsonb,
  participant_count int,
  message_count bigint,
  first_message_at timestamptz,
  last_message_at timestamptz,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    -- Clamp 200 -> 10000 so the CSV export (getChatConversationsForExport pages
    -- at 1000/page) fetches the whole set; a 200 clamp truncated exports to 200.
    SELECT GREATEST(page_number, 1) AS pg_num, LEAST(GREATEST(page_size, 1), 10000) AS pg_size
  ),
  room_msgs AS (
    SELECT cm.room_id,
      count(*)::bigint AS message_count,
      min(cm.created_at) AS first_message_at,
      max(cm.created_at) AS last_message_at
    FROM dedup.chat_messages cm
    WHERE cm.is_deleted = false AND cm.room_id IS NOT NULL
    GROUP BY cm.room_id
  ),
  -- Participant names/phones only for DM rooms (2 people); pool rooms use title.
  members AS (
    SELECT m.room_id,
      jsonb_agg(jsonb_build_object('user_id', u.id, 'name', u.name, 'phone', u.phone) ORDER BY u.name) AS participants,
      count(*)::int AS participant_count,
      string_agg(coalesce(u.name, '') || ' ' || coalesce(u.phone, ''), ' ') AS member_blob
    FROM dedup.chat_members m
    JOIN dedup.chat_rooms r ON r.id = m.room_id AND r.pool_id IS NULL
    JOIN dedup.users u ON u.id = m.user_id
    GROUP BY m.room_id
  ),
  base AS (
    SELECT
      rm.room_id,
      CASE WHEN r.pool_id IS NULL THEN 'dm' ELSE 'pool' END AS room_kind_out,
      CASE
        WHEN r.pool_id IS NOT NULL
          THEN 'Pool: ' || COALESCE(NULLIF(p.title, ''), NULLIF(p.category, ''), '(untitled pool)')
        ELSE COALESCE(NULLIF(r.name, ''), 'Direct message')
      END AS label,
      CASE WHEN r.pool_id IS NOT NULL
        THEN COALESCE(NULLIF(p.title, ''), NULLIF(p.category, '')) END AS pool_title,
      mem.participants,
      COALESCE(mem.participant_count, 0) AS participant_count,
      rm.message_count,
      rm.first_message_at,
      rm.last_message_at,
      coalesce(mem.member_blob, '') || ' ' || coalesce(p.title, '') || ' ' || coalesce(r.name, '') AS search_blob
    FROM room_msgs rm
    JOIN dedup.chat_rooms r ON r.id = rm.room_id
    LEFT JOIN dedup.pools p ON p.id = r.pool_id
    LEFT JOIN members mem ON mem.room_id = rm.room_id
  ),
  filtered AS (
    SELECT b.*, count(*) OVER ()::bigint AS total_count
    FROM base b
    WHERE (room_kind = 'all' OR b.room_kind_out = room_kind)
      AND (date_from IS NULL OR b.last_message_at >= date_from)
      AND (date_to IS NULL OR b.last_message_at <= date_to)
      AND (search_text IS NULL OR b.search_blob ILIKE '%' || search_text || '%')
  ),
  ranked AS (
    SELECT f.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN sort_by = 'messages' AND sort_dir = 'asc' THEN f.message_count END ASC NULLS LAST,
          CASE WHEN sort_by = 'messages' AND sort_dir = 'desc' THEN f.message_count END DESC NULLS LAST,
          CASE WHEN sort_by = 'recent' AND sort_dir = 'asc' THEN f.last_message_at END ASC NULLS LAST,
          CASE WHEN sort_by = 'recent' AND sort_dir = 'desc' THEN f.last_message_at END DESC NULLS LAST,
          f.last_message_at DESC NULLS LAST
      ) AS rn
    FROM filtered f
  )
  SELECT r.room_id, r.room_kind_out, r.label, r.pool_title, r.participants,
         r.participant_count, r.message_count, r.first_message_at, r.last_message_at, r.total_count
  FROM ranked r, bounds b
  WHERE r.rn > (b.pg_num - 1) * b.pg_size AND r.rn <= b.pg_num * b.pg_size
  ORDER BY r.rn;
$$;

GRANT EXECUTE ON FUNCTION analytics_chat_conversations(
  text, text, timestamptz, timestamptz, text, text, int, int
) TO service_role;


-- 2) Messages within one room (expand-on-demand). --------------------------
CREATE OR REPLACE FUNCTION analytics_chat_room_messages(
  target_room uuid,
  page_number int DEFAULT 1,
  page_size int DEFAULT 100
)
RETURNS TABLE(
  message_id uuid,
  sender_id uuid,
  sender_name text,
  sender_phone text,
  recipient_name text,
  recipient_phone text,
  content text,
  msg_type text,
  is_deleted boolean,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    SELECT GREATEST(page_number, 1) AS pg_num, LEAST(GREATEST(page_size, 1), 200) AS pg_size
  ),
  member_count AS (
    SELECT count(*)::int AS n
    FROM (SELECT DISTINCT user_id FROM public.chat_members WHERE room_id = target_room) d
  ),
  msgs AS (
    SELECT DISTINCT ON (cm.id) cm.id, cm.sender_id, cm.type, cm.content, cm.is_deleted, cm.created_at
    FROM public.chat_messages cm
    WHERE cm.room_id = target_room
    ORDER BY cm.id
  ),
  ranked AS (
    SELECT m.*, count(*) OVER ()::bigint AS total_count,
      row_number() OVER (ORDER BY m.created_at DESC) AS rn
    FROM msgs m
  ),
  page AS (
    SELECT r.* FROM ranked r, bounds b
    WHERE r.rn > (b.pg_num - 1) * b.pg_size AND r.rn <= b.pg_num * b.pg_size
  )
  SELECT
    p.id,
    p.sender_id,
    su.name, su.phone,
    other.name, other.phone,
    p.content, p.type::text, p.is_deleted, p.created_at,
    p.total_count
  FROM page p
  LEFT JOIN dedup.users su ON su.id = p.sender_id
  LEFT JOIN LATERAL (
    -- The counterpart, only for 2-member (DM) rooms.
    SELECT u2.name, u2.phone
    FROM (SELECT DISTINCT user_id FROM public.chat_members WHERE room_id = target_room) mm
    JOIN dedup.users u2 ON u2.id = mm.user_id, member_count mc
    WHERE mc.n = 2 AND mm.user_id <> p.sender_id
    LIMIT 1
  ) other ON true
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION analytics_chat_room_messages(uuid, int, int) TO service_role;


-- 3) Users: one row per (human) user who sent messages. --------------------
CREATE OR REPLACE FUNCTION analytics_chat_users(
  search_text text DEFAULT NULL,
  room_kind text DEFAULT 'all',         -- all | dm | pool
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL,
  sort_by text DEFAULT 'recent',        -- recent | signed_up | messages
  sort_dir text DEFAULT 'desc',
  page_number int DEFAULT 1,
  page_size int DEFAULT 50
)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  phone text,
  signed_up_at timestamptz,
  dm_msg_count bigint,
  pool_msg_count bigint,
  total_msgs bigint,
  first_message_at timestamptz,
  last_message_at timestamptz,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    -- Clamp 200 -> 10000 so the CSV export (getChatUsersForExport pages at
    -- 1000/page) fetches the whole set; a 200 clamp truncated exports to 200.
    SELECT GREATEST(page_number, 1) AS pg_num, LEAST(GREATEST(page_size, 1), 10000) AS pg_size
  ),
  user_msgs AS (
    SELECT cm.sender_id AS user_id,
      count(*) FILTER (WHERE cr.pool_id IS NULL)::bigint AS dm_msg_count,
      count(*) FILTER (WHERE cr.pool_id IS NOT NULL)::bigint AS pool_msg_count,
      count(*)::bigint AS total_msgs,
      min(cm.created_at) AS first_message_at,
      max(cm.created_at) AS last_message_at
    FROM dedup.chat_messages cm
    LEFT JOIN dedup.chat_rooms cr ON cr.id = cm.room_id
    WHERE cm.sender_id IS NOT NULL AND cm.is_deleted = false
    GROUP BY cm.sender_id
  ),
  base AS (
    SELECT u.id AS user_id, u.name, u.phone, u.created_at AS signed_up_at,
      um.dm_msg_count, um.pool_msg_count, um.total_msgs, um.first_message_at, um.last_message_at
    FROM user_msgs um
    JOIN dedup.users u ON u.id = um.user_id AND u.is_bot = false
  ),
  filtered AS (
    SELECT b.*, count(*) OVER ()::bigint AS total_count
    FROM base b
    WHERE (search_text IS NULL OR b.name ILIKE '%' || search_text || '%' OR b.phone ILIKE '%' || search_text || '%')
      AND (date_from IS NULL OR b.last_message_at >= date_from)
      AND (date_to IS NULL OR b.last_message_at <= date_to)
      AND (
        room_kind = 'all'
        OR (room_kind = 'dm' AND b.dm_msg_count > 0)
        OR (room_kind = 'pool' AND b.pool_msg_count > 0)
      )
  ),
  ranked AS (
    SELECT f.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN sort_by = 'messages' AND sort_dir = 'asc' THEN f.total_msgs END ASC NULLS LAST,
          CASE WHEN sort_by = 'messages' AND sort_dir = 'desc' THEN f.total_msgs END DESC NULLS LAST,
          CASE WHEN sort_by = 'signed_up' AND sort_dir = 'asc' THEN f.signed_up_at END ASC NULLS LAST,
          CASE WHEN sort_by = 'signed_up' AND sort_dir = 'desc' THEN f.signed_up_at END DESC NULLS LAST,
          CASE WHEN sort_by = 'recent' AND sort_dir = 'asc' THEN f.last_message_at END ASC NULLS LAST,
          CASE WHEN sort_by = 'recent' AND sort_dir = 'desc' THEN f.last_message_at END DESC NULLS LAST,
          f.last_message_at DESC NULLS LAST
      ) AS rn
    FROM filtered f
  )
  SELECT r.user_id, r.name, r.phone, r.signed_up_at, r.dm_msg_count, r.pool_msg_count,
         r.total_msgs, r.first_message_at, r.last_message_at, r.total_count
  FROM ranked r, bounds b
  WHERE r.rn > (b.pg_num - 1) * b.pg_size AND r.rn <= b.pg_num * b.pg_size
  ORDER BY r.rn;
$$;

GRANT EXECUTE ON FUNCTION analytics_chat_users(
  text, text, timestamptz, timestamptz, text, text, int, int
) TO service_role;


-- 4) Messages sent by one user (expand-on-demand). -------------------------
CREATE OR REPLACE FUNCTION analytics_chat_user_messages(
  target_user uuid,
  page_number int DEFAULT 1,
  page_size int DEFAULT 100
)
RETURNS TABLE(
  message_id uuid,
  room_id uuid,
  room_kind_out text,
  room_label text,
  counterpart_name text,
  counterpart_phone text,
  content text,
  msg_type text,
  is_deleted boolean,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    SELECT GREATEST(page_number, 1) AS pg_num, LEAST(GREATEST(page_size, 1), 200) AS pg_size
  ),
  msgs AS (
    SELECT DISTINCT ON (cm.id) cm.id, cm.room_id, cm.type, cm.content, cm.is_deleted, cm.created_at
    FROM public.chat_messages cm
    WHERE cm.sender_id = target_user
    ORDER BY cm.id
  ),
  ranked AS (
    SELECT m.*, count(*) OVER ()::bigint AS total_count,
      row_number() OVER (ORDER BY m.created_at DESC) AS rn
    FROM msgs m
  ),
  page AS (
    SELECT r.* FROM ranked r, bounds b
    WHERE r.rn > (b.pg_num - 1) * b.pg_size AND r.rn <= b.pg_num * b.pg_size
  )
  SELECT
    p.id,
    p.room_id,
    CASE WHEN cr.pool_id IS NULL THEN 'dm' ELSE 'pool' END,
    CASE
      WHEN cr.pool_id IS NOT NULL
        THEN 'Pool: ' || COALESCE(NULLIF(pl.title, ''), NULLIF(pl.category, ''), '(untitled pool)')
      ELSE COALESCE(NULLIF(cr.name, ''), 'Direct message')
    END,
    other.name, other.phone,
    p.content, p.type::text, p.is_deleted, p.created_at,
    p.total_count
  FROM page p
  LEFT JOIN dedup.chat_rooms cr ON cr.id = p.room_id
  LEFT JOIN dedup.pools pl ON pl.id = cr.pool_id
  LEFT JOIN LATERAL (
    -- Counterpart only when the room has exactly 2 members (a DM).
    SELECT u2.name, u2.phone
    FROM (SELECT DISTINCT user_id FROM public.chat_members WHERE room_id = p.room_id) mm
    JOIN dedup.users u2 ON u2.id = mm.user_id
    WHERE mm.user_id <> target_user
      AND (SELECT count(*) FROM (SELECT DISTINCT user_id FROM public.chat_members WHERE room_id = p.room_id) d) = 2
    LIMIT 1
  ) other ON true
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION analytics_chat_user_messages(uuid, int, int) TO service_role;
