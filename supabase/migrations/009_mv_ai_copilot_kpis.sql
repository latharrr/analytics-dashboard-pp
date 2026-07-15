-- AI/Copilot & Automation KPIs. bot_* tables are near-empty per the spec
-- (schema browser only, no dedicated charts yet) but are cheap to include
-- as scalars here.
CREATE MATERIALIZED VIEW mv_ai_copilot_kpis AS
SELECT
  (SELECT count(*) FROM copilot_chats) AS total_copilot_chats,
  (SELECT count(*) FROM copilot_messages) AS total_copilot_messages,
  (SELECT count(*) FROM copilot_messages WHERE created_at >= now() - interval '7 days') AS copilot_messages_last_7_days,
  (SELECT count(*) FROM vu_personas WHERE is_active = true) AS active_virtual_users,
  (SELECT count(*) FROM vu_action_log) AS total_vu_actions,
  (SELECT count(*) FROM vu_action_log WHERE created_at >= now() - interval '7 days') AS vu_actions_last_7_days,
  (SELECT count(*) FROM vu_action_log WHERE error IS NOT NULL) AS vu_action_errors,
  (SELECT count(*) FROM vu_pool_decisions) AS total_vu_pool_decisions,
  (SELECT count(*) FROM vu_task_schedules WHERE is_active = true) AS active_vu_task_schedules,
  (SELECT count(*) FROM bot_personas WHERE is_active = true) AS active_bot_personas,
  (SELECT count(*) FROM bot_action_log) AS total_bot_actions,
  (SELECT count(*) FROM bot_pool_assignments WHERE is_active = true) AS active_bot_pool_assignments;

CREATE UNIQUE INDEX ON mv_ai_copilot_kpis ((1));
GRANT SELECT ON mv_ai_copilot_kpis TO analytics_readonly;
