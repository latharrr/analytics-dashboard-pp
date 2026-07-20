import {
  getDauWauMau,
  getNewUsersPerDay,
  getActiveUsersPerDay,
  getActiveUsersTotal,
  getActivityByHour,
  getActiveUsersByProximity,
  getFeatureAdoption,
  getActivationFunnel,
  getRetentionCohorts,
  type RetentionCohort,
} from "@/lib/db/activityBreakdown";
import { getTopCollegesByUsers } from "@/lib/db/growthBreakdown";
import {
  getPoolCompletionByCategory,
  getAskAroundEngagedUsers,
  getAskAroundByNewUsers,
  getAskAroundCreatorVerification,
  type VerificationBreakdown,
} from "@/lib/db/poolBreakdown";
import { getNewUserActivitySummary } from "@/lib/db/newUserActivity";
import { getNewUserLocationsSummary } from "@/lib/db/newUserLocations";
import { getPgFlatLeadsSummary } from "@/lib/db/pgFlatLeads";
import { getKpiSnapshot, getRefreshInfo } from "@/lib/db/kpi";
import type { BarDatum } from "@/components/kpi/BarChartCard";
import type { InlineKeyboardButton } from "@/lib/telegram/client";
import { formatValue, humanizeKey, formatAsOf } from "@/lib/format";

export const MAIN_MENU: InlineKeyboardButton[][] = [
  [
    { text: "DAU", callback_data: "dau" },
    { text: "WAU", callback_data: "wau" },
    { text: "MAU", callback_data: "mau" },
  ],
  [
    { text: "New users/day", callback_data: "nu" },
    { text: "Active users/day", callback_data: "au" },
  ],
  [{ text: "📈 More activity metrics", callback_data: "more_activity" }],
  [{ text: "📊 KPI dashboards", callback_data: "more_kpi" }],
];

const ACTIVITY_SUBMENU: InlineKeyboardButton[][] = [
  [
    { text: "Activity by hour", callback_data: "hourly" },
    { text: "By college", callback_data: "college" },
  ],
  [
    { text: "Feature adoption", callback_data: "features" },
    { text: "Activation funnel", callback_data: "funnel" },
  ],
  [
    { text: "Retention cohorts", callback_data: "retention" },
    { text: "Top colleges", callback_data: "top_colleges" },
  ],
  [
    { text: "Ask Around users", callback_data: "ask_around" },
    { text: "Ask Around by new users", callback_data: "ask_around_new_users" },
  ],
  [{ text: "New user activity", callback_data: "new_user_activity" }],
  [{ text: "New users by location", callback_data: "new_user_locations" }],
  [{ text: "PG/Flat leads (30d)", callback_data: "pg_flat_leads" }],
  [{ text: "⬅️ Back", callback_data: "menu" }],
];

const KPI_SUBMENU: InlineKeyboardButton[][] = [
  [
    { text: "Growth", callback_data: "growth" },
    { text: "Pools", callback_data: "pools" },
  ],
  [
    { text: "Chat", callback_data: "chat" },
    { text: "Trust", callback_data: "trust" },
  ],
  [
    { text: "Monetization", callback_data: "monetization" },
    { text: "Matching", callback_data: "matching" },
  ],
  [
    { text: "AI/Copilot", callback_data: "aicopilot" },
    { text: "Pool completion %", callback_data: "pool_completion" },
  ],
  [{ text: "⬅️ Back", callback_data: "menu" }],
];

function rangeMenu(prefix: "nu" | "au"): InlineKeyboardButton[][] {
  return [
    [
      { text: "Last 1 day", callback_data: `${prefix}:1` },
      { text: "Last 7 days", callback_data: `${prefix}:7` },
      { text: "Last 30 days", callback_data: `${prefix}:30` },
    ],
    [{ text: "⬅️ Back", callback_data: "menu" }],
  ];
}

/** 1/7/15/30-day picker, for metrics scoped to a "new users" cohort rather than a day-by-day trend. */
function fourWayRangeMenu(prefix: string): InlineKeyboardButton[][] {
  return [
    [
      { text: "Last 1 day", callback_data: `${prefix}:1` },
      { text: "Last 7 days", callback_data: `${prefix}:7` },
    ],
    [
      { text: "Last 15 days", callback_data: `${prefix}:15` },
      { text: "Last 30 days", callback_data: `${prefix}:30` },
    ],
    [{ text: "⬅️ Back", callback_data: "menu" }],
  ];
}

function nowAsOf(): string {
  return `As of ${formatAsOf(new Date().toISOString())}`;
}

async function formatSnapshot(): Promise<string> {
  const { dau, wau, mau } = await getDauWauMau();
  return `📊 DAU: ${dau.toLocaleString()}\nWAU: ${wau.toLocaleString()}\nMAU: ${mau.toLocaleString()}\n\n${nowAsOf()} (live)`;
}

/** For genuine day-by-day trends, where summing across the period is meaningful (e.g. new users — each person signs up on exactly one day). */
function formatSeries(title: string, rows: BarDatum[]): string {
  if (rows.length === 0) return `${title}\nNo data.\n\n${nowAsOf()} (live)`;
  const lines = rows.map((r) => `${r.label}: ${r.value.toLocaleString()}`);
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return [title, ...lines, `Total: ${total.toLocaleString()}`, "", nowAsOf() + " (live)"].join("\n");
}

/**
 * For active users specifically: the same person can be active on several
 * days within the range, so summing the daily rows (like formatSeries does)
 * double-counts them. `uniqueTotal` comes from getActiveUsersTotal(), a
 * separate distinct-across-the-whole-range query, not a sum of `rows`.
 */
function formatActiveSeries(title: string, rows: BarDatum[], uniqueTotal: number): string {
  if (rows.length === 0) return `${title}\nNo data.\n\n${nowAsOf()} (live)`;
  const lines = rows.map((r) => `${r.label}: ${r.value.toLocaleString()}`);
  return [
    title,
    ...lines,
    `Unique active users this period: ${uniqueTotal.toLocaleString()}`,
    "",
    nowAsOf() + " (live)",
  ].join("\n");
}

/** For breakdowns where the categories overlap (a user can use multiple features, live near multiple colleges, etc.), so a "Total" line would be misleading. */
function formatBreakdown(title: string, rows: BarDatum[]): string {
  if (rows.length === 0) return `${title}\nNo data.\n\n${nowAsOf()} (live)`;
  const lines = rows.map((r) => `${r.label}: ${r.value.toLocaleString()}`);
  return [title, ...lines, "", nowAsOf() + " (live)"].join("\n");
}

/** Same as formatBreakdown, but for rows whose value is already a percentage (e.g. completion rate per category). */
function formatPercentBreakdown(title: string, rows: BarDatum[]): string {
  if (rows.length === 0) return `${title}\nNo data.\n\n${nowAsOf()} (live)`;
  const lines = rows.map((r) => `${r.label}: ${r.value}%`);
  return [title, ...lines, "", nowAsOf() + " (live)"].join("\n");
}

/** Digilocker/college-ID verification lines for a group of Ask Around creators, plus a bot-creator line kept separate from the human breakdown. */
function verificationLines(label: string, v: VerificationBreakdown): string[] {
  return [
    `Of ${label}:`,
    `  Digilocker only: ${v.digilockerOnly.toLocaleString()}`,
    `  College ID only: ${v.collegeOnly.toLocaleString()}`,
    `  Both: ${v.both.toLocaleString()}`,
    `  Neither: ${v.neither.toLocaleString()}`,
    `Bot accounts that also created one (excluded above): ${v.botCreators.toLocaleString()}`,
  ];
}

/** For a cohort-conversion stat: how many of a "new users" cohort went on to do something, plus a verification breakdown of the ones who did. */
function formatCohortConversion(
  title: string,
  cohortSize: number,
  converted: number,
  verification: VerificationBreakdown
): string {
  const pctLine = cohortSize > 0 ? `${Math.round((converted / cohortSize) * 1000) / 10}%` : "N/A";
  return [
    title,
    `New users: ${cohortSize.toLocaleString()}`,
    `Created an Ask Around: ${converted.toLocaleString()} (${pctLine})`,
    "",
    ...verificationLines(`the ${converted.toLocaleString()} creators`, verification),
    "",
    nowAsOf() + " (live)",
  ].join("\n");
}

/** Matches the % rounding in src/app/(dashboard)/retention/page.tsx's pct(). */
function pct(retained: number, cohortSize: number): string {
  if (!cohortSize) return "N/A";
  return `${Math.round((retained / cohortSize) * 1000) / 10}%`;
}

function formatRetention(rows: RetentionCohort[]): string {
  const title = "📈 Retention cohorts (last 8 weeks)";
  if (rows.length === 0) return `${title}\nNo data.\n\n${nowAsOf()} (live)`;
  const lines = rows.map(
    (r) =>
      `${r.cohortWeek} (n=${r.cohortSize}): W1 ${pct(r.week1, r.cohortSize)} · W2 ${pct(r.week2, r.cohortSize)} · W3 ${pct(r.week3, r.cohortSize)} · W4 ${pct(r.week4, r.cohortSize)}`
  );
  return [title, ...lines, "", nowAsOf() + " (live)"].join("\n");
}

/** Same generic rendering StatTileGrid uses for a KPI materialized-view snapshot row. */
async function formatKpiArea(title: string, viewName: string): Promise<string> {
  const [row, refreshInfo] = await Promise.all([getKpiSnapshot(viewName), getRefreshInfo()]);
  if (!row) return `${title}\nNo data yet — has the materialized view been refreshed?`;
  const lines = Object.entries(row)
    .filter(([, v]) => typeof v !== "object" || v === null)
    .map(([key, value]) => `${humanizeKey(key)}: ${formatValue(value)}`);
  const asOf = refreshInfo?.refreshed_at
    ? `As of ${formatAsOf(refreshInfo.refreshed_at)} (nightly refresh)`
    : "As of: never refreshed yet";
  return [title, ...lines, "", asOf].join("\n");
}

export interface IntentResult {
  text: string;
  keyboard?: InlineKeyboardButton[][];
}

const MAX_SERIES_DAYS = 90;

/** Shared by both the fixed 1/7/30 range buttons and free-text queries with an arbitrary day count. */
export async function runSeriesIntent(prefix: "nu" | "au", daysRaw: number): Promise<IntentResult> {
  const days = Math.min(Math.max(Math.round(daysRaw), 1), MAX_SERIES_DAYS);
  if (prefix === "nu") {
    const rows = await getNewUsersPerDay(days);
    const title = `🆕 New users — last ${days} day${days > 1 ? "s" : ""}`;
    return { text: formatSeries(title, rows), keyboard: MAIN_MENU };
  }
  const [rows, uniqueTotal] = await Promise.all([getActiveUsersPerDay(days), getActiveUsersTotal(days)]);
  const title = `👥 Active users — last ${days} day${days > 1 ? "s" : ""}`;
  return { text: formatActiveSeries(title, rows, uniqueTotal), keyboard: MAIN_MENU };
}

/** Shared by both the fixed 1/7/15/30 range buttons and free-text queries with an arbitrary day count. */
export async function runAskAroundByNewUsersIntent(daysRaw: number): Promise<IntentResult> {
  const days = Math.min(Math.max(Math.round(daysRaw), 1), MAX_SERIES_DAYS);
  const result = await getAskAroundByNewUsers(days);
  const title = `🙋 Ask Around created by new users — last ${days} day${days > 1 ? "s" : ""}`;
  return {
    text: formatCohortConversion(title, result.newUsers, result.askAroundCreators, result),
    keyboard: MAIN_MENU,
  };
}

/** Shared by both the fixed 1/7/15/30 range buttons and free-text queries with an arbitrary day count. */
export async function runNewUserActivityIntent(daysRaw: number): Promise<IntentResult> {
  const days = Math.min(Math.max(Math.round(daysRaw), 1), MAX_SERIES_DAYS);
  const rows = await getNewUserActivitySummary(days);
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const title = `🆕 New user activity — last ${days} day${days > 1 ? "s" : ""}`;
  const dateRange = `${formatAsOf(from.toISOString())} → ${formatAsOf(to.toISOString())}`;
  const lines = rows.map((r) => `${r.label}: ${r.value.toLocaleString()}`);
  const text = [title, dateRange, "", ...lines, "", nowAsOf() + " (live)"].join("\n");
  return { text, keyboard: MAIN_MENU };
}

/** Shared by both the fixed 1/7/15/30 range buttons and free-text queries with an arbitrary day count. */
export async function runNewUserLocationsIntent(daysRaw: number): Promise<IntentResult> {
  const days = Math.min(Math.max(Math.round(daysRaw), 1), MAX_SERIES_DAYS);
  const rows = await getNewUserLocationsSummary(days);
  const title = `📍 New users by location — last ${days} day${days > 1 ? "s" : ""}`;
  const text = [
    formatBreakdown(title, rows),
    "Names and phone numbers aren't sent here — see New User Locations on the dashboard to view and export contacts.",
  ].join("\n");
  return { text, keyboard: MAIN_MENU };
}

/** Single-shot breakdowns with a fixed internal window (same as their dashboard pages — no range picker). */
const FIXED_WINDOW_INTENTS: Record<string, () => Promise<IntentResult>> = {
  hourly: async () => ({
    text: formatBreakdown("🕐 Activity by hour (last 30 days)", await getActivityByHour()),
    keyboard: MAIN_MENU,
  }),
  college: async () => ({
    text: formatBreakdown("🏫 Active users by college (last 30 days, 5km radius)", await getActiveUsersByProximity()),
    keyboard: MAIN_MENU,
  }),
  features: async () => ({
    text: formatBreakdown("🧩 Feature adoption (last 30 days)", await getFeatureAdoption()),
    keyboard: MAIN_MENU,
  }),
  funnel: async () => ({
    text: formatBreakdown("🚦 Activation funnel (last 30 days)", await getActivationFunnel()),
    keyboard: MAIN_MENU,
  }),
  retention: async () => ({
    text: formatRetention(await getRetentionCohorts()),
    keyboard: MAIN_MENU,
  }),
  top_colleges: async () => ({
    text: formatBreakdown("🎓 Top colleges by user count", await getTopCollegesByUsers(5)),
    keyboard: MAIN_MENU,
  }),
  pool_completion: async () => ({
    text: formatPercentBreakdown("✅ Pool completion rate by category", await getPoolCompletionByCategory()),
    keyboard: MAIN_MENU,
  }),
  ask_around: async () => {
    const [engaged, verification] = await Promise.all([
      getAskAroundEngagedUsers(),
      getAskAroundCreatorVerification(),
    ]);
    const text = [
      "🙋 Users who created or joined an Ask Around",
      engaged.toLocaleString(),
      "",
      ...verificationLines(`the ${verification.creators.toLocaleString()} all-time creators`, verification),
      "",
      nowAsOf() + " (live)",
    ].join("\n");
    return { text, keyboard: MAIN_MENU };
  },
  pg_flat_leads: async () => {
    const rows = await getPgFlatLeadsSummary(30);
    const text = [
      formatBreakdown("🏠 PG/Flat leads — last 30 days", rows),
      "Names and phone numbers aren't sent here — see PG / Flat Leads on the dashboard to view and export contacts.",
    ].join("\n");
    return { text, keyboard: MAIN_MENU };
  },
};

/** The 7 nightly-refreshed KPI materialized views — one per dashboard tab. */
const KPI_AREAS: Record<string, { view: string; title: string }> = {
  growth: { view: "mv_growth_kpis", title: "🌱 Growth" },
  pools: { view: "mv_pool_kpis", title: "🏊 Pools" },
  chat: { view: "mv_chat_kpis", title: "💬 Chat" },
  trust: { view: "mv_trust_kpis", title: "🛡️ Trust & Verification" },
  monetization: { view: "mv_monetization_kpis", title: "💰 Monetization" },
  matching: { view: "mv_matching_kpis", title: "🤝 Matching" },
  aicopilot: { view: "mv_ai_copilot_kpis", title: "🤖 AI / Copilot & Automation" },
};

/** Handles fixed-menu navigation and taps (callback_data values only — 1/7/30 day ranges). */
export async function runIntent(key: string): Promise<IntentResult | null> {
  if (key === "menu") {
    return { text: "📊 What would you like to see?", keyboard: MAIN_MENU };
  }
  if (key === "more_activity") {
    return { text: "📈 Activity metrics:", keyboard: ACTIVITY_SUBMENU };
  }
  if (key === "more_kpi") {
    return { text: "📊 Which dashboard?", keyboard: KPI_SUBMENU };
  }
  if (key === "dau" || key === "wau" || key === "mau") {
    return { text: await formatSnapshot(), keyboard: MAIN_MENU };
  }
  if (key === "nu") {
    return { text: "New users per day — choose a range:", keyboard: rangeMenu("nu") };
  }
  if (key === "au") {
    return { text: "Active users per day — choose a range:", keyboard: rangeMenu("au") };
  }
  if (key === "ask_around_new_users") {
    return { text: "Ask Around created by new users — choose a range:", keyboard: fourWayRangeMenu("aanu") };
  }
  if (key === "new_user_activity") {
    return { text: "New user activity — choose a range:", keyboard: fourWayRangeMenu("nua") };
  }
  if (key === "new_user_locations") {
    return { text: "New users by location — choose a range:", keyboard: fourWayRangeMenu("nul") };
  }
  if (key in FIXED_WINDOW_INTENTS) {
    return FIXED_WINDOW_INTENTS[key]();
  }
  if (key in KPI_AREAS) {
    const area = KPI_AREAS[key];
    return { text: await formatKpiArea(area.title, area.view), keyboard: MAIN_MENU };
  }

  const [prefix, daysStr] = key.split(":");
  const days = Number(daysStr);
  if ((prefix === "nu" || prefix === "au") && [1, 7, 30].includes(days)) {
    return runSeriesIntent(prefix, days);
  }
  if (prefix === "aanu" && [1, 7, 15, 30].includes(days)) {
    return runAskAroundByNewUsersIntent(days);
  }
  if (prefix === "nua" && [1, 7, 15, 30].includes(days)) {
    return runNewUserActivityIntent(days);
  }
  if (prefix === "nul" && [1, 7, 15, 30].includes(days)) {
    return runNewUserLocationsIntent(days);
  }

  return null;
}

/**
 * Pulls an explicit day count out of free text ("last 3 days", "past 14
 * days", "this week"), or null if none is stated. Deliberately NOT an LLM
 * guess — a wrong number here would silently answer the wrong question, so
 * this is plain deterministic parsing. Callers default to 7 days when this
 * returns null.
 */
export function extractDayCount(text: string): number | null {
  const lower = text.toLowerCase();
  if (/\btoday\b|\byesterday\b/.test(lower)) return 1;
  if (/\bthis week\b|\blast week\b/.test(lower)) return 7;
  if (/\bthis month\b|\blast month\b/.test(lower)) return 30;
  const match = lower.match(/(\d+)\s*day/);
  if (match) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) return Math.min(n, MAX_SERIES_DAYS);
  }
  return null;
}

type Metric =
  | "dau"
  | "wau"
  | "mau"
  | "new_users"
  | "active_users"
  | "activity_by_hour"
  | "proximity"
  | "feature_adoption"
  | "activation_funnel"
  | "retention"
  | "top_colleges"
  | "pool_completion"
  | "ask_around"
  | "ask_around_new_users"
  | "new_user_activity"
  | "new_user_locations"
  | "pg_flat_leads"
  | "growth"
  | "pools"
  | "chat"
  | "trust"
  | "monetization"
  | "matching"
  | "aicopilot";

/** Maps a metric key to what the user meant, for the classifier prompt. Fixed-window metrics don't take a day count — same as their dashboard pages. */
const METRIC_LABELS: Record<Metric, string> = {
  dau: "daily active users right now — a single current snapshot number",
  wau: "weekly active users right now — a single current snapshot number",
  mau: "monthly active users right now — a single current snapshot number",
  new_users: "new user signups over a period of days — a day-by-day trend, e.g. 'new users this week' or 'signups last 3 days'",
  active_users: "active users over a period of days — a day-by-day trend, e.g. 'active users last 2 weeks'",
  activity_by_hour: "what hours of the day people are most active, peak traffic hours, last 30 days",
  proximity: "active users by college / near a college, geographic breakdown, last 30 days",
  feature_adoption: "which features are used, feature adoption/usage breakdown, last 30 days",
  activation_funnel: "the activation/onboarding funnel, signup-to-active-user stages, last 30 days",
  retention: "retention cohorts, how many users come back week over week",
  top_colleges: "top colleges/universities ranked by number of verified users",
  pool_completion: "pool completion rate broken down by pool category",
  ask_around: "how many users have created or joined an Ask Around pool/post, all-time",
  ask_around_new_users: "of users who signed up recently (new users), how many created an Ask Around pool/post — a day-count cohort conversion, e.g. 'ask around by new users last 15 days'",
  new_user_activity: "what activity new users (recent signups) have done — chat, joining/creating a pool, PG search, flat/flatmate listing, trust actions — broken down by type, over a period of days, e.g. 'what have new users done in the last 15 days'",
  new_user_locations: "new users (recent signups) broken down by nearest college/location, e.g. 'where are new users signing up from', 'new user locations last 7 days' — aggregate counts only here, no names or phone numbers",
  pg_flat_leads: "PG search / Flat listing / Flatmate listing leads count, last 30 days (aggregate counts only — no names or phone numbers here)",
  growth: "Growth dashboard: signups, verification rates, referrals, where new users come from",
  pools: "Pools dashboard: pool creation, participation, completion rates, pool sizes",
  chat: "Chat dashboard: messaging activity, rooms, chat members, chat requests",
  trust: "Trust & Verification dashboard: trust score, KYC, Digilocker, trust ledger actions, bans",
  monetization: "Monetization dashboard: revenue, payments, subscriptions, transactions",
  matching: "Matching dashboard: match rates, roommate/flatmate matching activity",
  aicopilot: "AI / Copilot dashboard: AI assistant usage, automation activity",
};

const FIXED_WINDOW_METRICS = new Set<Metric>([
  "activity_by_hour",
  "proximity",
  "feature_adoption",
  "activation_funnel",
  "retention",
  "top_colleges",
  "pool_completion",
  "ask_around",
  "pg_flat_leads",
]);

const KPI_METRICS = new Set<Metric>(["growth", "pools", "chat", "trust", "monetization", "matching", "aicopilot"]);

/** Maps a fixed-window Metric to its FIXED_WINDOW_INTENTS/KPI_AREAS key (identical strings today, kept separate for clarity). */
const METRIC_TO_INTENT_KEY: Partial<Record<Metric, string>> = {
  activity_by_hour: "hourly",
  proximity: "college",
  feature_adoption: "features",
  activation_funnel: "funnel",
  retention: "retention",
  top_colleges: "top_colleges",
  pool_completion: "pool_completion",
  ask_around: "ask_around",
  pg_flat_leads: "pg_flat_leads",
  growth: "growth",
  pools: "pools",
  chat: "chat",
  trust: "trust",
  monetization: "monetization",
  matching: "matching",
  aicopilot: "aicopilot",
};

/**
 * Classifies free text into one of the metric categories above, or null if
 * unclear. Deliberately NOT text-to-SQL, and deliberately doesn't ask the
 * model to pick a day count either (see extractDayCount): this dashboard's
 * README documents that a free-text-to-SQL AI Query panel was built and
 * removed for giving wrong answers, so the model here only ever picks a
 * *category* from a small closed set of already-correct queries — the
 * actual query and its parameters are resolved deterministically.
 */
export async function classifyMetric(question: string): Promise<Metric | null> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL;
  if (!apiKey || !model) return null;

  const options = Object.entries(METRIC_LABELS)
    .map(([key, desc]) => `${key} = ${desc}`)
    .join("\n");

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 10,
        messages: [
          {
            role: "system",
            content: `Classify the user's question into exactly one of these keys, or reply "none" if nothing fits:\n${options}\n\nReply with ONLY the key, nothing else.`,
          },
          { role: "user", content: question },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`classifyMetric failed: ${res.status} ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    const raw = String(data?.choices?.[0]?.message?.content ?? "")
      .trim()
      .toLowerCase();
    return raw in METRIC_LABELS ? (raw as Metric) : null;
  } catch (err) {
    console.error("classifyMetric failed:", err);
    return null;
  }
}

/** Resolves a classified free-text Metric into an actual reply. */
export async function runMetric(metric: Metric, questionText: string): Promise<IntentResult | null> {
  if (metric === "dau" || metric === "wau" || metric === "mau") {
    return runIntent(metric);
  }
  if (metric === "new_users" || metric === "active_users") {
    return runSeriesIntent(metric === "new_users" ? "nu" : "au", extractDayCount(questionText) ?? 7);
  }
  if (metric === "ask_around_new_users") {
    return runAskAroundByNewUsersIntent(extractDayCount(questionText) ?? 7);
  }
  if (metric === "new_user_activity") {
    return runNewUserActivityIntent(extractDayCount(questionText) ?? 7);
  }
  if (metric === "new_user_locations") {
    return runNewUserLocationsIntent(extractDayCount(questionText) ?? 7);
  }
  if (FIXED_WINDOW_METRICS.has(metric) || KPI_METRICS.has(metric)) {
    const key = METRIC_TO_INTENT_KEY[metric];
    return key ? runIntent(key) : null;
  }
  return null;
}
