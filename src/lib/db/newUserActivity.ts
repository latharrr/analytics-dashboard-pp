import { getServiceClient } from "@/lib/supabase/server";
import type { BarDatum } from "@/components/kpi/BarChartCard";

export interface NewUserActivityEvent {
  userId: string;
  userName: string | null;
  phone: string | null;
  signedUpAt: string;
  activityType: string;
  occurredAt: string;
  detail: string | null;
}

/** Per-activity-type counts for users who signed up in the last daysBack days. Backed by analytics_new_user_activity_summary() (migration 024). */
export async function getNewUserActivitySummary(daysBack: number): Promise<BarDatum[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_new_user_activity_summary", { days_back: daysBack });
  if (error) {
    console.error("getNewUserActivitySummary failed:", error.message);
    return [];
  }
  if (!data) return [];
  return (data as { activity: string; user_count: number }[]).map((r) => ({
    label: r.activity,
    value: r.user_count,
  }));
}

interface ActivityDetailRow {
  user_id: string;
  user_name: string | null;
  phone: string | null;
  signed_up_at: string;
  activity_type: string;
  occurred_at: string;
  detail: string | null;
}

/** PostgREST caps every response (incl. RPC results) at this project's "Max rows = 1000". */
const RPC_PAGE_SIZE = 1000;
/** Safety bound on total event rows paged, so a bug can't loop forever. */
const MAX_EVENT_ROWS = 50_000;

/**
 * One row per (user, activity, timestamp) event, most recent first. Backed by
 * analytics_new_user_activity_detail() (migration 036), whose `rowLimit` caps
 * *users* and returns ALL of their events — so the number of event rows is
 * unbounded by rowLimit and routinely exceeds the 1000-row PostgREST response
 * cap. Paged via `.range()` so no user's activity is silently truncated (a
 * single call returned exactly 1000 rows = clipped).
 */
export async function getNewUserActivityDetail(daysBack: number, rowLimit = 500): Promise<NewUserActivityEvent[]> {
  const supabase = getServiceClient();
  const raw: ActivityDetailRow[] = [];
  for (let from = 0; from < MAX_EVENT_ROWS; from += RPC_PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc("analytics_new_user_activity_detail", { days_back: daysBack, row_limit: rowLimit })
      .range(from, from + RPC_PAGE_SIZE - 1);
    if (error) {
      console.error("getNewUserActivityDetail failed:", error.message);
      break;
    }
    const page = (data ?? []) as ActivityDetailRow[];
    raw.push(...page);
    if (page.length < RPC_PAGE_SIZE) break;
  }
  return raw.map((r) => ({
    userId: r.user_id,
    userName: r.user_name,
    phone: r.phone,
    signedUpAt: r.signed_up_at,
    activityType: r.activity_type,
    occurredAt: r.occurred_at,
    detail: r.detail,
  }));
}
