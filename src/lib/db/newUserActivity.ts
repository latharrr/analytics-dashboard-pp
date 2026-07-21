import { getServiceClient } from "@/lib/supabase/server";
import type { BarDatum } from "@/components/kpi/BarChartCard";
import type { ActivityFilter } from "@/lib/db/allUsers";

export interface NewUserActivityEvent {
  activityType: string;
  occurredAt: string;
  detail: string | null;
}

/** One new-signup user with their in-window activity (events empty if inactive). */
export interface NewUserActivityUser {
  userId: string;
  userName: string | null;
  phone: string | null;
  signedUpAt: string;
  lastActivityAt: string | null;
  activityCount: number;
  events: NewUserActivityEvent[];
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
  last_activity_at: string | null;
  activity_count: number;
  events: { activity_type: string; occurred_at: string; detail: string | null }[] | null;
}

/** PostgREST caps every response (incl. RPC results) at this project's "Max rows = 1000". */
const RPC_PAGE_SIZE = 1000;

/**
 * One row per new-signup user (most-recently-active first, then inactive by
 * signup), with their in-window activity aggregated into `events`.
 *
 * Backed by analytics_new_user_activity_by_user() (migrations 038, 041). As of
 * 041 the function LEFT-joins activity onto the cohort, so users who signed up
 * but did NOTHING are returned too (activity_count 0, events []) — previously
 * they were invisible. `activityFilter` maps to the SQL all/active/inactive
 * filter; `rowLimit` caps *users* (see migration 036's cap-by-users rationale).
 *
 * Users are paged only if rowLimit > 1000 (e.g. the CSV export), a handful of
 * pages; the function collapses to ≤rowLimit rows so a single call is ~3s.
 */
export async function getNewUserActivityByUser(
  daysBack: number,
  activityFilter: ActivityFilter = "all",
  rowLimit = 500
): Promise<NewUserActivityUser[]> {
  const supabase = getServiceClient();
  const out: NewUserActivityUser[] = [];
  for (let from = 0; from < rowLimit; from += RPC_PAGE_SIZE) {
    const to = Math.min(from + RPC_PAGE_SIZE, rowLimit) - 1;
    const { data, error } = await supabase
      .rpc("analytics_new_user_activity_by_user", {
        days_back: daysBack,
        user_limit: rowLimit,
        activity_filter: activityFilter,
      })
      .range(from, to);
    if (error) {
      console.error("getNewUserActivityByUser failed:", error.message);
      break;
    }
    const page = (data ?? []) as ByUserRow[];
    for (const u of page) {
      out.push({
        userId: u.user_id,
        userName: u.user_name,
        phone: u.phone,
        signedUpAt: u.signed_up_at,
        lastActivityAt: u.last_activity_at,
        activityCount: u.activity_count,
        events: (u.events ?? []).map((e) => ({
          activityType: e.activity_type,
          occurredAt: e.occurred_at,
          detail: e.detail,
        })),
      });
    }
    if (page.length < to - from + 1) break;
  }
  return out;
}

/**
 * Flattened per-event rows for the CSV export — one row per event, plus one
 * placeholder row (blank activity columns) per inactive user so they're not
 * dropped from the export.
 */
export interface FlatActivityRow {
  userId: string;
  userName: string | null;
  phone: string | null;
  signedUpAt: string;
  activityType: string | null;
  occurredAt: string | null;
  detail: string | null;
}

export async function getNewUserActivityDetailFlat(
  daysBack: number,
  activityFilter: ActivityFilter = "all",
  rowLimit = 500
): Promise<FlatActivityRow[]> {
  const users = await getNewUserActivityByUser(daysBack, activityFilter, rowLimit);
  const rows: FlatActivityRow[] = [];
  for (const u of users) {
    if (u.events.length === 0) {
      rows.push({
        userId: u.userId,
        userName: u.userName,
        phone: u.phone,
        signedUpAt: u.signedUpAt,
        activityType: null,
        occurredAt: null,
        detail: null,
      });
      continue;
    }
    for (const e of u.events) {
      rows.push({
        userId: u.userId,
        userName: u.userName,
        phone: u.phone,
        signedUpAt: u.signedUpAt,
        activityType: e.activityType,
        occurredAt: e.occurredAt,
        detail: e.detail,
      });
    }
  }
  return rows;
}
