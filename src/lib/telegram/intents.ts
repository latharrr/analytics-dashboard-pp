import { getDauWauMau, getNewUsersPerDay, getActiveUsersPerDay } from "@/lib/db/activityBreakdown";
import type { BarDatum } from "@/components/kpi/BarChartCard";
import type { InlineKeyboardButton } from "@/lib/telegram/client";

export const MAIN_MENU: InlineKeyboardButton[][] = [
  [
    { text: "DAU", callback_data: "dau" },
    { text: "WAU", callback_data: "wau" },
    { text: "MAU", callback_data: "mau" },
  ],
  [{ text: "New users/day", callback_data: "nu" }],
  [{ text: "Active users/day", callback_data: "au" }],
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

function formatSeries(title: string, rows: BarDatum[]): string {
  if (rows.length === 0) return `${title}\nNo data.`;
  const lines = rows.map((r) => `${r.label}: ${r.value.toLocaleString()}`);
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return [title, ...lines, `Total: ${total.toLocaleString()}`].join("\n");
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

type Metric = "dau" | "wau" | "mau" | "new_users" | "active_users";

/** Maps a metric key to what the user meant, for the classifier prompt. */
const METRIC_LABELS: Record<Metric, string> = {
  dau: "daily active users right now — a single current snapshot number",
  wau: "weekly active users right now — a single current snapshot number",
  mau: "monthly active users right now — a single current snapshot number",
  new_users: "new user signups over a period of days — a day-by-day trend, e.g. 'new users this week' or 'signups last 3 days'",
  active_users: "active users over a period of days — a day-by-day trend, e.g. 'active users last 2 weeks'",
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
