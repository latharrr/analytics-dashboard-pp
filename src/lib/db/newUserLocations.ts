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

/** PostgREST caps every response (incl. RPC results) at this project's "Max rows = 1000". */
const RPC_PAGE_SIZE = 1000;

async function fetchDetailRows(daysBack: number, rowLimit: number): Promise<DetailRow[]> {
  const supabase = getServiceClient();
  const rows: DetailRow[] = [];
  // Page past the 1000-row PostgREST response cap; without this the location
  // summary (which asks for up to 100k rows) and the CSV export silently
  // aggregate only the most-recent 1000 signups and undercount every location.
  for (let from = 0; from < rowLimit; from += RPC_PAGE_SIZE) {
    const to = Math.min(from + RPC_PAGE_SIZE, rowLimit) - 1;
    const { data, error } = await supabase
      .rpc("analytics_new_user_locations_detail", { days_back: daysBack, row_limit: rowLimit })
      .range(from, to);
    if (error) {
      console.error("getNewUserLocations failed:", error.message);
      break;
    }
    const page = (data ?? []) as DetailRow[];
    rows.push(...page);
    if (page.length < to - from + 1) break;
  }
  return rows;
}

// Exported so the view/summary can single out these two "no city" buckets.
export const NO_LOCATION_LABEL = "No location captured";
export const UNRESOLVED_LOCATION_LABEL = "Unknown location";

/**
 * Two distinct "no city" cases, deliberately labelled differently:
 *  - NO_LOCATION_LABEL: the app never recorded a coordinate for this user
 *    (users.location IS NULL). Nothing to geocode — a data-collection gap,
 *    not a lookup failure. This is the majority of blanks.
 *  - UNRESOLVED_LOCATION_LABEL: a coordinate exists but hasn't been
 *    reverse-geocoded to a city yet (cold cache, or the geocoder returned
 *    nothing). Resolves on a later load as the coordinate cache warms.
 */
function labelFor(row: DetailRow, labels: Map<string, string | null>): string {
  if (row.lat == null || row.lng == null) return NO_LOCATION_LABEL;
  return labels.get(locationCacheKey(row.lat, row.lng)) ?? UNRESOLVED_LOCATION_LABEL;
}

/**
 * New-user signups (users.created_at — there's no separate app-download
 * event in this data) reverse-geocoded to "City, State" via LocationIQ's
 * free-tier reverse-geocoding API, cached by coordinate (migration 028) so
 * repeat locations don't re-hit the API. Bot accounts excluded. Backed by
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
