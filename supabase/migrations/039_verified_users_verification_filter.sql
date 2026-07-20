-- Verified Users previously only ever showed users verified via BOTH
-- Digilocker AND college ID (an inner join on both signals). This adds a
-- `verification_filter` param so the dashboard can also show/export
-- Digilocker-only or college-only verified users, and switch between the
-- two methods instead of always requiring both:
--
--   'both'       (default, unchanged from migration 029) — verified via
--                 Digilocker AND college ID.
--   'digilocker' — has a Digilocker link, college verification optional.
--   'college'    — has a verified college ID, Digilocker optional.
--   'either'     — verified via at least one of the two methods.
--
-- The two existing output columns (digilocker_verified_at,
-- college_verified_at) already carry a per-method timestamp (NULL when
-- that method isn't satisfied), which is enough for the UI to render each
-- as its own badge/column — no new output column needed.
--
-- Signature changes (new trailing parameter), so per this repo's
-- convention for signature/column changes (see migrations 023, 028, 030),
-- the old function is dropped first rather than CREATE OR REPLACE'd, to
-- avoid leaving an ambiguous overload PostgREST can't resolve.

DROP FUNCTION IF EXISTS analytics_verified_users_detail(timestamptz, timestamptz, text, text, int);

CREATE FUNCTION analytics_verified_users_detail(
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL,
  search_text text DEFAULT NULL,
  college_search text DEFAULT NULL,
  row_limit int DEFAULT 500,
  verification_filter text DEFAULT 'both'
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
    LEFT JOIN dg ON dg.user_id = u.id
    LEFT JOIN cv ON cv.user_id = u.id
    LEFT JOIN dedup.colleges col ON col.id = cv.college_id
    WHERE u.is_bot = false
      AND (
        CASE lower(coalesce(verification_filter, 'both'))
          WHEN 'digilocker' THEN dg.user_id IS NOT NULL
          WHEN 'college' THEN cv.user_id IS NOT NULL
          WHEN 'either' THEN dg.user_id IS NOT NULL OR cv.user_id IS NOT NULL
          ELSE dg.user_id IS NOT NULL AND cv.user_id IS NOT NULL -- 'both'
        END
      )
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

GRANT EXECUTE ON FUNCTION analytics_verified_users_detail(timestamptz, timestamptz, text, text, int, text) TO service_role;
