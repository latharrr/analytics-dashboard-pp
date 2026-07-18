import { getServiceClient } from "@/lib/supabase/server";
import type { BarDatum } from "@/components/kpi/BarChartCard";

/**
 * Top colleges by verified user_colleges membership, excluding bot/virtual-user
 * accounts. Aggregated in JS (user_colleges is a small table). The raw table
 * holds duplicate import snapshots, so membership is deduplicated by
 * (user_id, college_id) rather than counted per row.
 */
export async function getTopCollegesByUsers(limit = 5): Promise<BarDatum[]> {
  const supabase = getServiceClient();

  const [{ data: userColleges, error: ucError }, { data: bots, error: botError }] = await Promise.all([
    supabase.from("user_colleges").select("college_id, user_id").eq("verification_status", "verified"),
    supabase.from("users").select("id").eq("is_bot", true),
  ]);
  if (ucError || botError || !userColleges || userColleges.length === 0) return [];

  const botIds = new Set((bots as { id: string }[] | null)?.map((b) => b.id) ?? []);

  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const row of userColleges as { college_id: string; user_id: string }[]) {
    if (botIds.has(row.user_id)) continue;
    const pair = `${row.user_id}:${row.college_id}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    counts.set(row.college_id, (counts.get(row.college_id) ?? 0) + 1);
  }

  const topIds = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (topIds.length === 0) return [];

  const { data: colleges, error: cError } = await supabase
    .from("colleges")
    .select("id, name")
    .in("id", topIds.map(([id]) => id));
  if (cError || !colleges) return [];

  const nameById = new Map((colleges as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  return topIds.map(([id, count]) => ({ label: nameById.get(id) ?? id, value: count }));
}
