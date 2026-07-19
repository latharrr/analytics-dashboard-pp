-- Enrich "New users by location" with city/state, not just the college
-- name (follow-up request after migration 026 shipped). Nothing else
-- changes: same nearest-college-within-5km match, same
-- 'Unknown / no college nearby' fallback for unmatched users.
-- analytics_new_user_locations_summary() picks this up automatically since
-- it just groups by whatever location_label _detail() returns.

CREATE OR REPLACE FUNCTION analytics_new_user_locations_detail(days_back int DEFAULT 7, row_limit int DEFAULT 500)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  phone text,
  location_label text,
  signed_up_at timestamptz,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  WITH cohort AS (
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.phone,
      CASE
        WHEN nearest.name IS NULL THEN 'Unknown / no college nearby'
        ELSE concat_ws(', ', nearest.name, nearest.city, nearest.state)
      END AS location_label,
      u.created_at AS signed_up_at
    FROM dedup.users u
    LEFT JOIN LATERAL (
      SELECT col.name, col.city, col.state
      FROM dedup.colleges col
      WHERE u.location IS NOT NULL
        AND ST_DWithin(u.location, col.location, 5000)
      ORDER BY u.location <-> col.location
      LIMIT 1
    ) nearest ON true
    WHERE u.is_bot = false
      AND u.created_at >= now() - (days_back || ' days')::interval
  )
  SELECT c.*, count(*) OVER ()::bigint AS total_count
  FROM cohort c
  ORDER BY c.signed_up_at DESC
  LIMIT row_limit;
$$;

GRANT EXECUTE ON FUNCTION analytics_new_user_locations_detail(int, int) TO service_role;
