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
  if (error || !data) return [];
  return (data as { activity: string; user_count: number }[]).map((r) => ({
    label: r.activity,
    value: r.user_count,
  }));
}

/** One row per (user, activity, timestamp) event, most recent first. Backed by analytics_new_user_activity_detail() (migration 030). */
export async function getNewUserActivityDetail(daysBack: number, rowLimit = 500): Promise<NewUserActivityEvent[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_new_user_activity_detail", {
    days_back: daysBack,
    row_limit: rowLimit,
  });
  if (error || !data) return [];
  return (
    data as {
      user_id: string;
      user_name: string | null;
      phone: string | null;
      signed_up_at: string;
      activity_type: string;
      occurred_at: string;
      detail: string | null;
    }[]
  ).map((r) => ({
    userId: r.user_id,
    userName: r.user_name,
    phone: r.phone,
    signedUpAt: r.signed_up_at,
    activityType: r.activity_type,
    occurredAt: r.occurred_at,
    detail: r.detail,
  }));
}
