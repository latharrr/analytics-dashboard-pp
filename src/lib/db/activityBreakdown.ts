import { getServiceClient } from "@/lib/supabase/server";
import type { BarDatum } from "@/components/kpi/BarChartCard";

export interface DauWauMau {
  dau: number;
  wau: number;
  mau: number;
}

/**
 * Live (not nightly-refreshed) snapshot counts, since these are cheap
 * single-column count queries. "Active" = users.last_activity within the
 * window; this is a real per-user last-seen timestamp, not a historical
 * event log, so this is a current snapshot, not a trend over past days.
 */
export async function getDauWauMau(): Promise<DauWauMau> {
  const supabase = getServiceClient();
  const now = Date.now();
  const cutoffs = {
    dau: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    wau: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    mau: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const [dau, wau, mau] = await Promise.all(
    [cutoffs.dau, cutoffs.wau, cutoffs.mau].map((cutoff) =>
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("is_bot", false)
        .gte("last_activity", cutoff)
    )
  );

  return { dau: dau.count ?? 0, wau: wau.count ?? 0, mau: mau.count ?? 0 };
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export async function getNewUsersPerDay(daysBack = 14): Promise<BarDatum[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_new_users_per_day", { days_back: daysBack });
  if (error || !data) return [];
  return (data as { day: string; new_users: number }[]).map((r) => ({
    label: formatDay(r.day),
    value: r.new_users,
  }));
}

/** Proxy for "active users per day": distinct users who sent a chat message, recorded a trust action, or joined a pool that day. */
export async function getActiveUsersPerDay(daysBack = 14): Promise<BarDatum[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_active_users_per_day", { days_back: daysBack });
  if (error || !data) return [];
  return (data as { day: string; active_users: number }[]).map((r) => ({
    label: formatDay(r.day),
    value: r.active_users,
  }));
}

/** Proxy for "peak active hours"/"hourly traffic": same activity signals, grouped by hour of day. */
export async function getActivityByHour(): Promise<BarDatum[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_activity_by_hour", { days_back: 30 });
  if (error || !data) return [];
  return (data as { hour_of_day: number; event_count: number }[]).map((r) => ({
    label: `${r.hour_of_day}:00`,
    value: r.event_count,
  }));
}

/** Active users (last 30 days) within 5km of each college. */
export async function getActiveUsersByProximity(): Promise<BarDatum[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_active_users_near_colleges", {
    radius_km: 5,
    days_back: 30,
  });
  if (error || !data) return [];
  return (data as { college_name: string; active_users: number }[]).map((r) => ({
    label: r.college_name,
    value: r.active_users,
  }));
}

export async function getFeatureAdoption(): Promise<BarDatum[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_feature_adoption", { days_back: 30 });
  if (error || !data) return [];
  return (data as { feature: string; active_users: number }[]).map((r) => ({
    label: r.feature,
    value: r.active_users,
  }));
}

export async function getActivationFunnel(): Promise<BarDatum[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_activation_funnel", { days_back: 30 });
  if (error || !data) return [];
  return (data as { stage: string; user_count: number }[]).map((r) => ({
    label: r.stage,
    value: r.user_count,
  }));
}

export interface RetentionCohort {
  cohortWeek: string;
  cohortSize: number;
  week1: number;
  week2: number;
  week3: number;
  week4: number;
}

export async function getRetentionCohorts(): Promise<RetentionCohort[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_retention_cohorts", { weeks_back: 8 });
  if (error || !data) return [];
  return (
    data as {
      cohort_week: string;
      cohort_size: number;
      week_1_retained: number;
      week_2_retained: number;
      week_3_retained: number;
      week_4_retained: number;
    }[]
  ).map((r) => ({
    cohortWeek: r.cohort_week,
    cohortSize: r.cohort_size,
    week1: r.week_1_retained,
    week2: r.week_2_retained,
    week3: r.week_3_retained,
    week4: r.week_4_retained,
  }));
}
