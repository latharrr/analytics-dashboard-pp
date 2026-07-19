-- "New users by location": for every new-user signup (users.created_at —
-- there is no separate app-download/install event anywhere in this data),
-- which college they're nearest to, plus contact info for follow-up.
--
-- Reuses the same nearest-college-within-5km proximity concept already used
-- by analytics_active_users_near_colleges (migration 018), but:
--   - scopes to *new* signups in a days_back window, not "active" users
--   - returns the single NEAREST college per user (LATERAL + KNN `<->`),
--     not "count near each college" — a user needs exactly one location
--   - includes users with no location on file or no college within 5km as
--     'Unknown / no college nearby', so the total reflects every signup,
--     not just the ones matched to a college
--
-- Two functions, same split as PG/Flat leads (migration 025) and new-user
-- activity (migration 024): a detail function with names/phones for the
-- dashboard table + CSV, and a location-only aggregate safe to post to
-- Telegram. Bot accounts excluded (migration 020 pattern).

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
      u.created_at AS signed_up_at,
      coalesce(nearest.name, 'Unknown / no college nearby') AS location_label
    FROM dedup.users u
    LEFT JOIN LATERAL (
      SELECT col.name
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

-- Aggregate counts by nearest college, for the Overview chart + Telegram
-- summary (no names/phones sent to chat).
CREATE OR REPLACE FUNCTION analytics_new_user_locations_summary(days_back int DEFAULT 7)
RETURNS TABLE(location_label text, user_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT location_label, count(*)::bigint
  FROM analytics_new_user_locations_detail(days_back, 100000)
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT 15;
$$;

GRANT EXECUTE ON FUNCTION analytics_new_user_locations_summary(int) TO service_role;
