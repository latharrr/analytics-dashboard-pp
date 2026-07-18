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
