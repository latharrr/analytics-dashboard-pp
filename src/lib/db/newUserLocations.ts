import { getServiceClient } from "@/lib/supabase/server";
import type { BarDatum } from "@/components/kpi/BarChartCard";

export interface NewUserLocation {
  userId: string;
  userName: string | null;
  phone: string | null;
  locationLabel: string;
  signedUpAt: string;
}

export interface NewUserLocationsResult {
  users: NewUserLocation[];
  totalCount: number;
}

/**
 * New-user signups (users.created_at) mapped to their nearest college within
 * 5km, or "Unknown / no college nearby" when there's no match. Bot accounts
 * excluded. Backed by analytics_new_user_locations_detail() (migration 026).
 */
export async function getNewUserLocations(daysBack: number, rowLimit = 500): Promise<NewUserLocationsResult> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_new_user_locations_detail", {
    days_back: daysBack,
    row_limit: rowLimit,
  });
  if (error || !data) return { users: [], totalCount: 0 };
  const rows = data as {
    user_id: string;
    user_name: string | null;
    phone: string | null;
    location_label: string;
    signed_up_at: string;
    total_count: number;
  }[];
  return {
    users: rows.map((r) => ({
      userId: r.user_id,
      userName: r.user_name,
      phone: r.phone,
      locationLabel: r.location_label,
      signedUpAt: r.signed_up_at,
    })),
    totalCount: rows[0]?.total_count ?? 0,
  };
}

/** Per-location counts of new-user signups — safe to send to Telegram (no names/phones). */
export async function getNewUserLocationsSummary(daysBack: number): Promise<BarDatum[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_new_user_locations_summary", { days_back: daysBack });
  if (error || !data) return [];
  return (data as { location_label: string; user_count: number }[]).map((r) => ({
    label: r.location_label,
    value: r.user_count,
  }));
}
