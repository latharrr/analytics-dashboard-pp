/**
 * Module -> table mapping, mirroring the build spec's section 3.
 * Drives the Data Explorer's table picker and the Schema Browser's grouping.
 */
export type ModuleKey =
  | "growth"
  | "pools"
  | "chat"
  | "trust"
  | "monetization"
  | "matching"
  | "ai_copilot"
  | "other";

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  tables: string[];
  hasKpiTab: boolean;
}

export const MODULES: ModuleDef[] = [
  {
    key: "growth",
    label: "Growth (Overview)",
    hasKpiTab: true,
    tables: [
      "users",
      "user_colleges",
      "colleges",
      "college_requests",
      "devices",
      "refresh_tokens",
      "auth_providers",
    ],
  },
  {
    key: "pools",
    label: "Pools",
    hasKpiTab: true,
    tables: [
      "pools",
      "pool_participants",
      "pool_likes",
      "pool_tags",
      "pool_pricing_config",
      "pool_ranting",
      "pool_buy_sell",
      "pool_event",
      "pool_cab_share",
      "pool_flat",
      "pool_flatmate",
      "pool_pg",
      "pool_ask_around",
      "pool_poll_votes",
      "vehicles",
      "pg_landmarks",
      "pg_hunt_queries",
    ],
  },
  {
    key: "chat",
    label: "Chat",
    hasKpiTab: true,
    tables: [
      "chat_rooms",
      "chat_messages",
      "chat_members",
      "chat_reactions",
      "chat_requests",
      "dm_permissions",
    ],
  },
  {
    key: "trust",
    label: "Trust & Verification",
    hasKpiTab: true,
    tables: ["trust_ledger", "trust_rules", "kyc_gate_rules", "digilocker_accounts"],
  },
  {
    key: "monetization",
    label: "Monetization",
    hasKpiTab: true,
    tables: [
      "rental_referral_clicks",
      "rental_referral_campaigns",
      "rental_referral_links",
      "rental_referral_senders",
      "rental_campaign_conversions",
      "user_rental_campaign_attributions",
      "flat_leads",
    ],
  },
  {
    key: "matching",
    label: "Matching",
    hasKpiTab: true,
    tables: [
      "flatmate_interactions",
      "user_lifestyle_profiles",
      "user_tag_affinity",
      "user_tags",
      "tags",
      "tag_categories",
      "intent_questions",
      "intent_question_responses",
    ],
  },
  {
    key: "ai_copilot",
    label: "AI/Copilot & Automation",
    hasKpiTab: true,
    tables: [
      "copilot_chats",
      "copilot_messages",
      "vu_action_log",
      "vu_pool_decisions",
      "vu_personas",
      "vu_room_cursor",
      "vu_chat_room_summary",
      "vu_task_schedules",
      "vu_tokens",
      "vu_weekly_schedule",
      "bot_personas",
      "bot_schedules",
      "bot_action_log",
      "bot_pool_assignments",
    ],
  },
  {
    key: "other",
    label: "Other (Schema Browser only)",
    hasKpiTab: false,
    tables: [
      "notification_campaigns",
      "notification_actions",
      "notification_logs",
      "push_digest_queue",
      "email_otps",
      "whatsapp_messages",
      "recording_campaigns",
      "user_communication_stats",
      "user_recording_quotas",
      "user_privacy_settings",
    ],
  },
];

/** Postgres/PostGIS internals and migration bookkeeping: never shown anywhere. */
export const EXCLUDED_TABLES = [
  "geography_columns",
  "geometry_columns",
  "spatial_ref_sys",
  "tag_relations",
  "schema_migrations",
  "vu_schema_migrations",
];

export const ALL_TRACKED_TABLES = MODULES.flatMap((m) => m.tables);

/** All 79 known relations (73 tracked/business + 6 excluded internals). */
export const ALL_KNOWN_RELATIONS = [...ALL_TRACKED_TABLES, ...EXCLUDED_TABLES];

export function moduleForTable(table: string): ModuleDef | undefined {
  return MODULES.find((m) => m.tables.includes(table));
}
