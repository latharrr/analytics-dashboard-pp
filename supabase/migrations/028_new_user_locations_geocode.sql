-- Switches "New users by location" from a nearest-college proxy to a real
-- reverse-geocoded city/state, per follow-up: "not college particularly, I
-- want their proximity where app was downloaded." Colleges in this data
-- turned out to be Delhi-heavy, so most signups (the ones not literally
-- within 5km of a tracked college) were showing as "Unknown".
--
-- Reverse geocoding itself (raw lat/lng -> city/state) happens app-side via
-- LocationIQ's free-tier reverse-geocoding API (src/lib/geocoding/locationIq.ts)
-- — there's no reverse-geocoding capability in this Postgres database. This
-- migration only does two things:
--   1. analytics_geocode_cache: a cache table keyed on coordinates rounded
--      to 3 decimal places (~111m), so the same building/campus never
--      re-calls the API twice. Written/read only via the
--      service-role client (src/lib/db/geocodeCache.ts) — same pattern as
--      analytics_rate_limits (migration 012) and analytics_telegram_subscribers
--      (migration 016), no explicit grants needed.
--   2. analytics_new_user_locations_detail now returns the raw lat/lng
--      instead of a pre-computed location_label, since the label is built
--      app-side after the cache lookup/geocode call. Must DROP + recreate
--      (not CREATE OR REPLACE) because the returned column set is changing.
--
-- analytics_new_user_locations_summary is dropped outright: aggregating by
-- city/state now has to happen app-side too (after resolving coordinates),
-- so the SQL-only aggregate no longer makes sense. See
-- getNewUserLocationsSummary() in src/lib/db/newUserLocations.ts.

CREATE TABLE IF NOT EXISTS analytics_geocode_cache (
  lat numeric(9,3) NOT NULL,
  lng numeric(9,3) NOT NULL,
  city text,
  state text,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lat, lng)
);

DROP FUNCTION IF EXISTS analytics_new_user_locations_summary(int);
DROP FUNCTION IF EXISTS analytics_new_user_locations_detail(int, int);

CREATE FUNCTION analytics_new_user_locations_detail(days_back int DEFAULT 7, row_limit int DEFAULT 500)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  phone text,
  lat double precision,
  lng double precision,
  signed_up_at timestamptz,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  WITH cohort AS (
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.phone,
      CASE WHEN u.location IS NOT NULL THEN ST_Y(u.location::geometry) END AS lat,
      CASE WHEN u.location IS NOT NULL THEN ST_X(u.location::geometry) END AS lng,
      u.created_at AS signed_up_at
    FROM dedup.users u
    WHERE u.is_bot = false
      AND u.created_at >= now() - (days_back || ' days')::interval
  )
  SELECT c.*, count(*) OVER ()::bigint AS total_count
  FROM cohort c
  ORDER BY c.signed_up_at DESC
  LIMIT row_limit;
$$;

GRANT EXECUTE ON FUNCTION analytics_new_user_locations_detail(int, int) TO service_role;
