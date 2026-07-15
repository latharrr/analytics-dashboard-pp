import { getServiceClient } from "@/lib/supabase/server";

/** Fetches the single aggregate row from a nightly-refreshed KPI materialized view. */
export async function getKpiSnapshot(
  viewName: string
): Promise<Record<string, unknown> | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from(viewName).select("*").limit(1).maybeSingle();
  if (error) {
    console.error(`getKpiSnapshot(${viewName}) failed:`, error.message);
    return null;
  }
  return data;
}

/** Fetches all rows from a KPI materialized view that holds a breakdown (e.g. top N). */
export async function getKpiRows(viewName: string): Promise<Record<string, unknown>[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from(viewName).select("*");
  if (error) {
    console.error(`getKpiRows(${viewName}) failed:`, error.message);
    return [];
  }
  return data ?? [];
}

export interface RefreshInfo {
  view_name: string;
  refreshed_at: string;
}

export async function getRefreshInfo(): Promise<RefreshInfo | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("analytics_refresh_log")
    .select("view_name, refreshed_at")
    .eq("view_name", "all")
    .maybeSingle();
  if (error) {
    console.error("getRefreshInfo failed:", error.message);
    return null;
  }
  return data;
}
