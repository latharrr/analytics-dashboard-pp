import { getServiceClient } from "@/lib/supabase/server";
import type { BarDatum } from "@/components/kpi/BarChartCard";

/** Completion rate (% of pools with status='closed') per category. Aggregated in JS (pools is ~1,949 rows). */
export async function getPoolCompletionByCategory(): Promise<BarDatum[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("pools").select("category, status");
  if (error || !data) return [];

  const totals = new Map<string, { total: number; closed: number }>();
  for (const row of data as { category: string; status: string }[]) {
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
