-- "PG/Flat intent leads": users who have shown real interest in PG housing
-- or Flat/Flatmate listings, with contact info for follow-up.
--
-- IMPORTANT: this app has no tap/click event tracking anywhere (no table
-- logs "user opened the PG tab" or "user tapped Flat/Flatmate"). These
-- three tables are the closest real signals that exist:
--   - pg_hunt_queries: user explicitly submitted a PG search (has a
--     notify-phone, budget, move-in timing — this is a real conversion,
--     not a tap)
--   - pool_flat: user created a Flat listing pool
--   - pool_flatmate: user created a Flatmate-seeking pool
-- pg_hunt_queries has no dedup.* view (migration 018 didn't cover it), but
-- it has zero duplicate rows (28 raw = 28 distinct ids at last check), so
-- it's queried directly from public. pool_flat/pool_flatmate already have
-- dedup.* views.
--
-- Bot accounts excluded (migration 020 pattern). Phone prefers the
-- activity's own contact field (pg_hunt_queries.notify_phone,
-- pool_flat.alt_contact_phone) over the user's profile phone, since that's
-- the number the person actually offered for follow-up on that lead.

CREATE OR REPLACE FUNCTION analytics_pg_flat_leads(
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL,
  row_limit int DEFAULT 1000
)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  phone text,
  activity_type text,
  occurred_at timestamptz,
  detail text,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  WITH leads AS (
    SELECT
      phq.user_id,
      u.name AS user_name,
      COALESCE(phq.notify_phone, u.phone) AS phone,
      'PG search'::text AS activity_type,
      phq.created_at AS occurred_at,
      concat_ws(
        ' · ',
        'Budget: ' || COALESCE(phq.budget_range, phq.max_budget::text),
        'Landing: ' || phq.landing_time,
        'Sharing: ' || array_to_string(phq.sharing_pref, ', ')
      ) AS detail
    FROM public.pg_hunt_queries phq
    JOIN dedup.users u ON u.id = phq.user_id AND u.is_bot = false

    UNION ALL

    SELECT
      pf.created_by,
      u.name,
      COALESCE(pf.alt_contact_phone, u.phone),
      'Flat listing',
      pf.created_at,
      concat_ws(
        ' · ',
        NULLIF(pf.bhk_type, ''),
        'Rent: ' || COALESCE(pf.rent::text, 'n/a'),
        'Furnishing: ' || COALESCE(pf.furnishing, 'n/a')
      )
    FROM dedup.pool_flat pf
    JOIN dedup.users u ON u.id = pf.created_by AND u.is_bot = false

    UNION ALL

    SELECT
      p.creator_id,
      u.name,
      u.phone,
      'Flatmate listing',
      pfm.created_at,
      concat_ws(
        ' · ',
        'City: ' || COALESCE(pfm.city, 'n/a'),
        'Budget: ' || COALESCE(pfm.target_budget::text, 'n/a'),
        'Urgency: ' || COALESCE(pfm.urgency_level::text, 'n/a')
      )
    FROM dedup.pool_flatmate pfm
    JOIN dedup.pools p ON p.id = pfm.pool_id
    JOIN dedup.users u ON u.id = p.creator_id AND u.is_bot = false
  )
  SELECT l.*, count(*) OVER ()::bigint AS total_count
  FROM leads l
  WHERE (date_from IS NULL OR l.occurred_at >= date_from)
    AND (date_to IS NULL OR l.occurred_at <= date_to)
  ORDER BY l.occurred_at DESC
  LIMIT row_limit;
$$;

GRANT EXECUTE ON FUNCTION analytics_pg_flat_leads(timestamptz, timestamptz, int) TO service_role;

-- Aggregate counts by type, for the Telegram summary (no PII sent to chat).
CREATE OR REPLACE FUNCTION analytics_pg_flat_leads_summary(days_back int DEFAULT 30)
RETURNS TABLE(activity_type text, lead_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT activity_type, count(*)::bigint
  FROM analytics_pg_flat_leads(now() - (days_back || ' days')::interval, NULL, 100000)
  GROUP BY activity_type
  ORDER BY 2 DESC;
$$;

GRANT EXECUTE ON FUNCTION analytics_pg_flat_leads_summary(int) TO service_role;
