-- "Verified Users" tab: users who are verified via BOTH DigiLocker (has a
-- row in digilocker_accounts, same existence check as
-- mv_trust_kpis.digilocker_linked_accounts and migration 023) AND college
-- ID (has a user_colleges row with verification_status = 'verified', same
-- definition as mv_growth_kpis.verified_college_users). Bot accounts
-- excluded (migration 020 pattern).
--
-- Filters (search text over name/phone, college name, signup date range)
-- are applied in SQL so the dashboard tab and its CSV export both filter
-- against the same source of truth instead of drifting.
--
-- A user can have more than one user_colleges row (re-verification,
-- college transfer); dedup.user_colleges (migration 018) is deduped per
-- row id, not per user, so `cv` below additionally picks the most
-- recently updated *verified* row per user as "their" college for
-- display. Same idea for `dg`, in case a user ever links more than one
-- Digilocker account.

CREATE OR REPLACE FUNCTION analytics_verified_users_detail(
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL,
  search_text text DEFAULT NULL,
  college_search text DEFAULT NULL,
  row_limit int DEFAULT 500
)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  phone text,
  college_name text,
  trust_score numeric,
  signed_up_at timestamptz,
  last_activity timestamptz,
  digilocker_verified_at timestamptz,
  college_verified_at timestamptz,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  WITH dg AS (
    SELECT DISTINCT ON (user_id) user_id, updated_at
    FROM dedup.digilocker_accounts
    ORDER BY user_id, updated_at DESC NULLS LAST
  ),
  cv AS (
    SELECT DISTINCT ON (uc.user_id) uc.user_id, uc.college_id, uc.updated_at
    FROM dedup.user_colleges uc
    WHERE uc.verification_status = 'verified'
    ORDER BY uc.user_id, uc.updated_at DESC NULLS LAST
  ),
  eligible AS (
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.phone,
      col.name AS college_name,
      u.trust_score,
      u.created_at AS signed_up_at,
      u.last_activity,
      dg.updated_at AS digilocker_verified_at,
      cv.updated_at AS college_verified_at
    FROM dedup.users u
    JOIN dg ON dg.user_id = u.id
    JOIN cv ON cv.user_id = u.id
    LEFT JOIN dedup.colleges col ON col.id = cv.college_id
    WHERE u.is_bot = false
  )
  SELECT e.*, count(*) OVER ()::bigint AS total_count
  FROM eligible e
  WHERE (date_from IS NULL OR e.signed_up_at >= date_from)
    AND (date_to IS NULL OR e.signed_up_at <= date_to)
    AND (
      search_text IS NULL
      OR e.user_name ILIKE '%' || search_text || '%'
      OR e.phone ILIKE '%' || search_text || '%'
    )
    AND (college_search IS NULL OR e.college_name ILIKE '%' || college_search || '%')
  ORDER BY e.signed_up_at DESC
  LIMIT row_limit;
$$;

GRANT EXECUTE ON FUNCTION analytics_verified_users_detail(timestamptz, timestamptz, text, text, int) TO service_role;
