import { getServiceClient } from "@/lib/supabase/server";
import type { BarDatum } from "@/components/kpi/BarChartCard";

/** Completion rate (% of pools with status='closed') per category. Aggregated in JS (pools is a small table). The raw table holds duplicate import snapshots of each pool, so rows are deduplicated by id first, keeping the freshest snapshot's status. */
export async function getPoolCompletionByCategory(): Promise<BarDatum[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("pools").select("id, category, status, updated_at");
  if (error || !data) return [];

  const latest = new Map<string, { category: string; status: string; updated_at: string | null }>();
  for (const row of data as { id: string; category: string; status: string; updated_at: string | null }[]) {
    const prev = latest.get(row.id);
    if (!prev || (row.updated_at ?? "") > (prev.updated_at ?? "")) {
      latest.set(row.id, row);
    }
  }

  const totals = new Map<string, { total: number; closed: number }>();
  for (const row of latest.values()) {
    const entry = totals.get(row.category) ?? { total: 0, closed: 0 };
    entry.total += 1;
    if (row.status === "closed") entry.closed += 1;
    totals.set(row.category, entry);
  }

  return Array.from(totals.entries())
    .map(([label, { total, closed }]) => ({
      label,
      value: total > 0 ? Math.round((closed / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Distinct users who have engaged with the "Ask Around" pool category
 * (pools.category = 'ask_around'), either by creating one or by joining
 * someone else's. All-time, bot accounts excluded. Backed by
 * analytics_ask_around_users() (migration 021).
 */
export async function getAskAroundEngagedUsers(): Promise<number> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_ask_around_users");
  if (error || data == null) return 0;
  return data as number;
}

export interface AskAroundByNewUsers {
  newUsers: number;
  askAroundCreators: number;
}

/**
 * Of users who signed up in the last daysBack days ("new users"), how many
 * have created at least one Ask Around pool. Backed by
 * analytics_ask_around_by_new_users() (migration 022).
 */
export async function getAskAroundByNewUsers(daysBack: number): Promise<AskAroundByNewUsers> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_ask_around_by_new_users", { days_back: daysBack });
  if (error || !data) return { newUsers: 0, askAroundCreators: 0 };
  const row = (data as { new_users: number; ask_around_creators: number }[])[0];
  return { newUsers: row?.new_users ?? 0, askAroundCreators: row?.ask_around_creators ?? 0 };
}
