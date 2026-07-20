import { getServiceClient } from "@/lib/supabase/server";
import type { BarDatum } from "@/components/kpi/BarChartCard";

/**
 * Top colleges by verified user_colleges membership, excluding bot/virtual-user
 * accounts. Deduped and aggregated in SQL via analytics_top_colleges_by_users()
 * (migration 037) over the dedup.* views. The previous JS implementation read
 * the raw public.user_colleges table with a bare `.select()`, which this
 * project's REST "Max rows = 1000" default silently truncated — and since the
 * raw table holds ~3x duplicate snapshots, it hit that cap after only ~330
 * distinct rows and undercounted every college once the app grew.
 */
export async function getTopCollegesByUsers(limit = 5): Promise<BarDatum[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_top_colleges_by_users", { row_limit: limit });
  if (error) {
    console.error("getTopCollegesByUsers failed:", error.message);
    return [];
  }
  if (!data) return [];
  return (data as { college_name: string; user_count: number }[]).map((r) => ({
    label: r.college_name,
    value: r.user_count,
  }));
}
