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

/** Handles both fixed-menu navigation (callback_data) and resolved free-text intent keys. */
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
    const rows = prefix === "nu" ? await getNewUsersPerDay(days) : await getActiveUsersPerDay(days);
    const noun = prefix === "nu" ? "New users" : "Active users";
    const emoji = prefix === "nu" ? "🆕" : "👥";
    const title = `${emoji} ${noun} — last ${days} day${days > 1 ? "s" : ""}`;
    return { text: formatSeries(title, rows), keyboard: MAIN_MENU };
  }

  return null;
}

/** Maps a free-text intent key (from classifyIntent) to what the user meant, for the classifier prompt. */
const INTENT_LABELS: Record<string, string> = {
  dau: "daily active users right now",
  wau: "weekly active users right now",
  mau: "monthly active users right now",
  "nu:1": "new user signups today / in the last 1 day",
  "nu:7": "new user signups in the last 7 days",
  "nu:30": "new user signups in the last 30 days",
  "au:1": "active users today / in the last 1 day",
  "au:7": "active users in the last 7 days",
  "au:30": "active users in the last 30 days",
};

/**
 * Classifies free text into one of the fixed intents above, or null if
 * unclear. Deliberately NOT text-to-SQL: this dashboard's README documents
 * that a free-text-to-SQL AI Query panel was built and removed for giving
 * wrong answers, so the model here only ever picks from this small closed
 * set of pre-vetted, already-correct queries — it never generates a query
 * of its own.
 */
export async function classifyIntent(question: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL;
  if (!apiKey || !model) return null;

  const options = Object.entries(INTENT_LABELS)
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
      console.error(`classifyIntent failed: ${res.status} ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    const raw = String(data?.choices?.[0]?.message?.content ?? "")
      .trim()
      .toLowerCase();
    return raw in INTENT_LABELS ? raw : null;
  } catch (err) {
    console.error("classifyIntent failed:", err);
    return null;
  }
}
