import { getServiceClient } from "@/lib/supabase/server";
import { reverseGeocode } from "@/lib/geocoding/locationIq";

const PRECISION = 3; // ~111m grid — nearby signups from the same building/campus share one cached lookup
const GRID = 10 ** PRECISION;

/** Caps how many *new* (uncached) geocode calls a single request can trigger, so a cold cache can't turn one page load into a huge burst of API calls. Leftover points fall back to "Unknown location" and get resolved on a later request once the cache is warmer. */
const MAX_LOOKUPS_PER_CALL = 20;
/** LocationIQ's free tier caps at ~2 requests/second — batch size 2 + a delay between batches keeps us under that. */
const CONCURRENCY = 2;
const BATCH_DELAY_MS = 1100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round(n: number): number {
  return Math.round(n * GRID) / GRID;
}

function cacheKey(lat: number, lng: number): string {
  return `${round(lat)},${round(lng)}`;
}

function formatLabel(city: string | null, state: string | null): string | null {
  const parts = [city, state].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Same rounding this module uses internally — callers use it to look up results in the returned map. */
export function locationCacheKey(lat: number, lng: number): string {
  return cacheKey(lat, lng);
}

interface CacheRow {
  lat: number | string;
  lng: number | string;
  city: string | null;
  state: string | null;
}

/**
 * Resolves a batch of (lat, lng) points to "City, State" labels, backed by
 * analytics_geocode_cache (migration 028). Cache misses call LocationIQ's
 * reverse-geocoding API (capped at MAX_LOOKUPS_PER_CALL per call, rate-limited
 * to respect its free-tier ~2 req/sec cap) and write results back so the
 * same coordinate never re-hits the API twice.
 */
export async function resolveLocationLabels(
  points: { lat: number; lng: number }[]
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();

  const uniquePoints = new Map<string, { lat: number; lng: number }>();
  for (const p of points) {
    const key = cacheKey(p.lat, p.lng);
    if (!uniquePoints.has(key)) uniquePoints.set(key, { lat: round(p.lat), lng: round(p.lng) });
  }
  if (uniquePoints.size === 0) return result;

  const supabase = getServiceClient();
  const { data: cached, error } = await supabase.from("analytics_geocode_cache").select("lat, lng, city, state");
  if (error) console.error("resolveLocationLabels: cache read failed:", error.message);

  for (const row of (cached ?? []) as CacheRow[]) {
    const key = cacheKey(Number(row.lat), Number(row.lng));
    if (uniquePoints.has(key)) {
      result.set(key, formatLabel(row.city, row.state));
      uniquePoints.delete(key);
    }
  }

  const missing = Array.from(uniquePoints.entries()).slice(0, MAX_LOOKUPS_PER_CALL);
  const toUpsert: { lat: number; lng: number; city: string | null; state: string | null }[] = [];

  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);
    const resolved = await Promise.all(
      batch.map(async ([key, coord]) => ({ key, coord, geo: await reverseGeocode(coord.lat, coord.lng) }))
    );
    for (const { key, coord, geo } of resolved) {
      result.set(key, geo ? formatLabel(geo.city, geo.state) : null);
      if (geo) toUpsert.push({ lat: coord.lat, lng: coord.lng, city: geo.city, state: geo.state });
    }
    if (i + CONCURRENCY < missing.length) await sleep(BATCH_DELAY_MS);
  }

  if (toUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from("analytics_geocode_cache")
      .upsert(toUpsert, { onConflict: "lat,lng" });
    if (upsertError) console.error("resolveLocationLabels: cache write failed:", upsertError.message);
  }

  return result;
}
