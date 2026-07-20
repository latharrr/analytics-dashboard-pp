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

interface ByUserRow {
  user_id: string;
  user_name: string | null;
  phone: string | null;
  signed_up_at: string;
  last_activity_at: string;
  activity_count: number;
  events: { activity_type: string; occurred_at: string; detail: string | null }[] | null;
}

/** PostgREST caps every response (incl. RPC results) at this project's "Max rows = 1000". */
const RPC_PAGE_SIZE = 1000;

/**
 * One row per (user, activity, timestamp) event, most recent first.
 *
 * Backed by analytics_new_user_activity_by_user() (migration 038), which
 * returns one row per active user with their events aggregated into a jsonb
 * array, then flattened back to per-event rows here. `rowLimit` caps *users*
 * (most-recently-active first), same intent as migration 036.
 *
 * Why per-user, not the per-event analytics_new_user_activity_detail(): that
 * function's events routinely exceed the 1000-row PostgREST response cap, and
 * paging past it re-ran an expensive 7-way UNION once per 1000-event page
 * (30d took ~47s and timed out). Grouping by user collapses the result to
 * ≤rowLimit rows, so the on-page 500-user view is a single fast call, and no
 * user's activity is truncated. Users are paged only if rowLimit > 1000
 * (e.g. the CSV export), which is a handful of pages, not dozens.
 */
export async function getNewUserActivityDetail(daysBack: number, rowLimit = 500): Promise<NewUserActivityEvent[]> {
  const supabase = getServiceClient();
  const out: NewUserActivityEvent[] = [];
  for (let from = 0; from < rowLimit; from += RPC_PAGE_SIZE) {
    const to = Math.min(from + RPC_PAGE_SIZE, rowLimit) - 1;
    const { data, error } = await supabase
      .rpc("analytics_new_user_activity_by_user", { days_back: daysBack, user_limit: rowLimit })
      .range(from, to);
    if (error) {
      console.error("getNewUserActivityDetail failed:", error.message);
      break;
    }
    const page = (data ?? []) as ByUserRow[];
    for (const u of page) {
      for (const e of u.events ?? []) {
        out.push({
          userId: u.user_id,
          userName: u.user_name,
          phone: u.phone,
          signedUpAt: u.signed_up_at,
          activityType: e.activity_type,
          occurredAt: e.occurred_at,
          detail: e.detail,
        });
      }
    }
    if (page.length < to - from + 1) break;
  }
  return out;
}
