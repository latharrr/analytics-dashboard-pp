-- Chat KPIs. Real status values confirmed via introspection:
-- chat_members.status: active, left, removed
-- chat_requests.status: pending, approved, rejected
-- dm_permissions.status: pending, approved, blocked
CREATE MATERIALIZED VIEW mv_chat_kpis AS
SELECT
  (SELECT count(*) FROM chat_rooms) AS total_rooms,
  (SELECT count(*) FROM chat_messages WHERE is_deleted = false) AS total_messages,
  (SELECT count(*) FROM chat_messages WHERE is_deleted = false AND created_at >= now() - interval '7 days') AS messages_last_7_days,
  (SELECT count(*) FROM chat_messages WHERE is_deleted = false AND created_at >= now() - interval '30 days') AS messages_last_30_days,
  (SELECT count(*) FROM chat_members WHERE status = 'active') AS active_memberships,
  (SELECT count(*) FROM chat_reactions) AS total_reactions,
  (SELECT count(*) FROM chat_requests WHERE status = 'pending') AS pending_chat_requests,
  (SELECT count(*) FROM chat_requests WHERE status = 'approved') AS approved_chat_requests,
  (SELECT count(*) FROM dm_permissions WHERE status = 'approved') AS approved_dm_permissions,
  (SELECT count(*) FROM dm_permissions WHERE status = 'blocked') AS blocked_dm_permissions,
  (
    SELECT round(avg(sub.cnt)::numeric, 1)
    FROM (SELECT room_id, count(*) AS cnt FROM chat_messages WHERE is_deleted = false GROUP BY room_id) sub
  ) AS avg_messages_per_room;

CREATE UNIQUE INDEX ON mv_chat_kpis ((1));
GRANT SELECT ON mv_chat_kpis TO analytics_readonly;
