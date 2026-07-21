-- Let "New User Locations" optionally cover the WHOLE user base, not just
-- recent signups — the "make new-user features work for all users too" request.
--
-- Backward-compatible: a days_back <= 0 means "all users" (skip the signup
-- window); any positive value keeps the existing rolling-window behaviour.
-- Signature unchanged, so CREATE OR REPLACE (no drop needed). The app passes
-- days_back = 0 for the "All users" toggle.

CREATE OR REPLACE FUNCTION analytics_new_user_locations_detail(days_back int DEFAULT 7, row_limit int DEFAULT 500)
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
      AND (days_back <= 0 OR u.created_at >= now() - (days_back || ' days')::interval)
  )
  SELECT c.*, count(*) OVER ()::bigint AS total_count
  FROM cohort c
  ORDER BY c.signed_up_at DESC
  LIMIT row_limit;
$$;

GRANT EXECUTE ON FUNCTION analytics_new_user_locations_detail(int, int) TO service_role;
