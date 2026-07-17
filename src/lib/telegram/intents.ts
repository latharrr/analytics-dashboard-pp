import {
  getDauWauMau,
  getNewUsersPerDay,
  getActiveUsersPerDay,
  getActivityByHour,
  getActiveUsersByProximity,
  getFeatureAdoption,
  getActivationFunnel,
  getRetentionCohorts,
  type RetentionCohort,
} from "@/lib/db/activityBreakdown";
import type { BarDatum } from "@/components/kpi/BarChartCard";
import type { InlineKeyboardButton } from "@/lib/telegram/client";

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
  [
    { text: "Activity by hour", callback_data: "hourly" },
    { text: "By college", callback_data: "college" },
  ],
  [
    { text: "Feature adoption", callback_data: "features" },
    { text: "Activation funnel", callback_data: "funnel" },
  ],
  [{ text: "Retention cohorts", callback_data: "retention" }],
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

async function formatSnapshot(): Promise<string> {
  const { dau, wau, mau } = await getDauWauMau();
  return `📊 DAU: ${dau.toLocaleString()}\nWAU: ${wau.toLocaleString()}\nMAU: ${mau.toLocaleString()}`;
}

/** For genuine day-by-day trends, where summing across the period is meaningful. */
function formatSeries(title: string, rows: BarDatum[]): string {
  if (rows.length === 0) return `${title}\nNo data.`;
  const lines = rows.map((r) => `${r.label}: ${r.value.toLocaleString()}`);
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return [title, ...lines, `Total: ${total.toLocaleString()}`].join("\n");
}

/** For breakdowns where the categories overlap (a user can use multiple features, live near multiple colleges, etc.), so a "Total" line would be misleading. */
function formatBreakdown(title: string, rows: BarDatum[]): string {
  if (rows.length === 0) return `${title}\nNo data.`;
  const lines = rows.map((r) => `${r.label}: ${r.value.toLocaleString()}`);
  return [title, ...lines].join("\n");
}

/** Matches the % rounding in src/app/(dashboard)/retention/page.tsx's pct(). */
function pct(retained: number, cohortSize: number): string {
  if (!cohortSize) return "N/A";
  return `${Math.round((retained / cohortSize) * 1000) / 10}%`;
}

function formatRetention(rows: RetentionCohort[]): string {
  const title = "📈 Retention cohorts (last 8 weeks)";
  if (rows.length === 0) return `${title}\nNo data.`;
  const lines = rows.map(
    (r) =>
      `${r.cohortWeek} (n=${r.cohortSize}): W1 ${pct(r.week1, r.cohortSize)} · W2 ${pct(r.week2, r.cohortSize)} · W3 ${pct(r.week3, r.cohortSize)} · W4 ${pct(r.week4, r.cohortSize)}`
  );
  return [title, ...lines].join("\n");
}

export interface IntentResult {
  text: string;
  keyboard?: InlineKeyboardButton[][];
}

const MAX_SERIES_DAYS = 90;

/** Shared by both the fixed 1/7/30 range buttons and free-text queries with an arbitrary day count. */
export async function runSeriesIntent(prefix: "nu" | "au", daysRaw: number): Promise<IntentResult> {
  const days = Math.min(Math.max(Math.round(daysRaw), 1), MAX_SERIES_DAYS);
  const rows = prefix === "nu" ? await getNewUsersPerDay(days) : await getActiveUsersPerDay(days);
  const noun = prefix === "nu" ? "New users" : "Active users";
  const emoji = prefix === "nu" ? "🆕" : "👥";
  const title = `${emoji} ${noun} — last ${days} day${days > 1 ? "s" : ""}`;
  return { text: formatSeries(title, rows), keyboard: MAIN_MENU };
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
};

/** Handles fixed-menu navigation and taps (callback_data values only — 1/7/30 day ranges). */
export async function runIntent(key: string): Promise<IntentResult | null> {
  if (key === "menu") {
    return { text: "📊 What would you like to see?", keyboard: MAIN_MENU };
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
  if (key in FIXED_WINDOW_INTENTS) {
    return FIXED_WINDOW_INTENTS[key]();
  }

  const [prefix, daysStr] = key.split(":");
  const days = Number(daysStr);
  if ((prefix === "nu" || prefix === "au") && [1, 7, 30].includes(days)) {
    return runSeriesIntent(prefix, days);
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
  | "retention";

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
};

const FIXED_WINDOW_METRICS = new Set<Metric>([
  "activity_by_hour",
  "proximity",
  "feature_adoption",
  "activation_funnel",
  "retention",
]);

/** Maps a fixed-window Metric to its FIXED_WINDOW_INTENTS key. */
const METRIC_TO_INTENT_KEY: Partial<Record<Metric, string>> = {
  activity_by_hour: "hourly",
  proximity: "college",
  feature_adoption: "features",
  activation_funnel: "funnel",
  retention: "retention",
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
  if (FIXED_WINDOW_METRICS.has(metric)) {
    const key = METRIC_TO_INTENT_KEY[metric];
    return key ? runIntent(key) : null;
  }
  return null;
}
