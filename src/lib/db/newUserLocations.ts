import { getServiceClient } from "@/lib/supabase/server";
import type { BarDatum } from "@/components/kpi/BarChartCard";
import { resolveLocationLabels, locationCacheKey } from "@/lib/db/geocodeCache";

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

interface DetailRow {
  user_id: string;
  user_name: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  signed_up_at: string;
  total_count: number;
}

async function fetchDetailRows(daysBack: number, rowLimit: number): Promise<DetailRow[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_new_user_locations_detail", {
    days_back: daysBack,
    row_limit: rowLimit,
  });
  if (error || !data) return [];
  return data as DetailRow[];
}

function labelFor(row: DetailRow, labels: Map<string, string | null>): string {
  if (row.lat == null || row.lng == null) return "Unknown location (no location on file)";
  return labels.get(locationCacheKey(row.lat, row.lng)) ?? "Unknown location";
}

/**
 * New-user signups (users.created_at — there's no separate app-download
 * event in this data) reverse-geocoded to "City, State" via the Google
 * Maps Geocoding API, cached by coordinate (migration 028) so repeat
 * locations don't re-hit the API. Bot accounts excluded. Backed by
 * analytics_new_user_locations_detail().
 */
export async function getNewUserLocations(daysBack: number, rowLimit = 500): Promise<NewUserLocationsResult> {
  const rows = await fetchDetailRows(daysBack, rowLimit);
  if (rows.length === 0) return { users: [], totalCount: 0 };

  const points = rows.filter((r) => r.lat != null && r.lng != null).map((r) => ({ lat: r.lat!, lng: r.lng! }));
  const labels = await resolveLocationLabels(points);

  return {
    users: rows.map((r) => ({
      userId: r.user_id,
      userName: r.user_name,
      phone: r.phone,
      locationLabel: labelFor(r, labels),
      signedUpAt: r.signed_up_at,
    })),
    totalCount: rows[0]?.total_count ?? 0,
  };
}

/** Per-location counts of new-user signups — safe to send to Telegram (no names/phones). */
export async function getNewUserLocationsSummary(daysBack: number): Promise<BarDatum[]> {
  const rows = await fetchDetailRows(daysBack, 100_000);
  if (rows.length === 0) return [];

  const points = rows.filter((r) => r.lat != null && r.lng != null).map((r) => ({ lat: r.lat!, lng: r.lng! }));
  const labels = await resolveLocationLabels(points);

  const counts = new Map<string, number>();
  for (const r of rows) {
    const label = labelFor(r, labels);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([label, value]) => ({ label, value }));
}
