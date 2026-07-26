-- Finishes the /api/all-users timeout fix that 046 only half-solved.
--
-- 046 precomputed the per-user aggregate into mv_user_engagement, which removed
-- ~19s of CPU. It was not enough: MEASURED after 046 was applied, the function
-- still ran 14,248 ms COLD (vs 904 ms warm) against the 8s budget. The residual
-- cost is I/O, not CPU, and EXPLAIN (ANALYZE, BUFFERS) shows exactly where:
--
--   * the roster reads 102,246 raw public.users rows through
--     idx_users_id_updated_at just to DISTINCT ON them down to 7,516, and
--   * the per-page LATERAL does 50 users x 7 tables = 350 scattered random
--     reads across chat_messages (520k rows), trust_ledger (477k),
--     pool_participants (222k).
--
-- Warm, all of that is in shared buffers and the page takes ~0.9s. Cold it is
-- ~14s. On this instance (free tier, currently flagged EXCEEDING USAGE LIMITS)
-- with a page visited a few times a day, every visit is effectively cold -- so
-- the page failed every single time while looking fine on an immediate re-run.
--
-- Shaving that margin has now failed twice (045's indexes, 046's partial MV).
-- So this migration removes the exposure entirely rather than reducing it:
-- precompute the WHOLE roster -- every column the page renders, for every
-- non-bot user -- into one small view. Measured: 7,516 rows / 890 kB total, so
-- even a fully cold read is a handful of sequential pages. The request-time
-- query becomes filter + sort + paginate over that, touching none of the big
-- tables and doing no LATERAL at all.
--
-- CORRECTNESS (verified against the live DB before writing this):
--   * total_activities / active_days computed here match mv_user_engagement --
--     i.e. migration 044's definition verbatim -- for all 1,710 users with
--     activity: 0 total_activities mismatches, 0 active_days mismatches, 0
--     users present in one and not the other.
--   * last_activity_* computed here via DISTINCT ON matched the live 7-way
--     LATERAL's answer on all 25 sampled users: 0 mismatches.
--   * pool_participants -> pools is a LEFT JOIN on purpose. 044 counted
--     dedup.pool_participants with NO join, so an INNER JOIN here would
--     silently drop any join whose pool row is missing and undercount. The
--     LEFT JOIN keeps the event and leaves the detail NULL.
--   * Bots and orphaned user_ids are excluded by the is_bot = false join, as
--     before. (For reference: of 79,284 total events, 22,288 belong to 33 bot
--     users and 1,461 to 135 user_ids absent from dedup.users; the page's real
--     figure is 55,535 events across 1,542 active users of 7,516 non-bot users.)

-- 1) The whole page, precomputed.
CREATE MATERIALIZED VIEW mv_all_users_roster AS
  WITH ev AS (
    SELECT cm.sender_id AS uid, 'Chat message'::text AS activity_type, cm.type::text AS detail,
           cm.created_at AS occurred_at
      FROM dedup.chat_messages cm WHERE cm.sender_id IS NOT NULL
    UNION ALL SELECT tl.user_id, 'Trust action', tl.reason, tl.created_at FROM dedup.trust_ledger tl
    UNION ALL SELECT pp.user_id, 'Joined a pool', p.category, pp.joined_at
      FROM dedup.pool_participants pp LEFT JOIN dedup.pools p ON p.id = pp.pool_id
    UNION ALL SELECT p.creator_id, 'Created a pool', p.category, p.created_at FROM dedup.pools p
    UNION ALL SELECT phq.user_id, 'PG search',
        concat_ws(' · ', 'Budget: ' || COALESCE(phq.budget_range, phq.max_budget::text),
                  'Landing: ' || phq.landing_time),
        phq.created_at
      FROM (SELECT DISTINCT ON (id) * FROM public.pg_hunt_queries ORDER BY id) phq
    UNION ALL SELECT pf.created_by, 'Flat listing', NULLIF(pf.bhk_type, ''), pf.created_at
      FROM dedup.pool_flat pf
    UNION ALL SELECT p.creator_id, 'Flatmate listing', 'City: ' || COALESCE(pfm.city, 'n/a'), pfm.created_at
      FROM dedup.pool_flatmate pfm JOIN dedup.pools p ON p.id = pfm.pool_id
  ),
  agg AS (
    SELECT uid, count(*)::bigint AS total_activities, count(DISTINCT occurred_at::date)::bigint AS active_days
    FROM ev WHERE uid IS NOT NULL GROUP BY uid
  ),
  last_ev AS (
    SELECT DISTINCT ON (uid) uid, activity_type, detail, occurred_at
    FROM ev WHERE uid IS NOT NULL
    ORDER BY uid, occurred_at DESC NULLS LAST
  )
  SELECT
    u.id AS user_id,
    u.name AS user_name,
    u.phone,
    u.created_at AS signed_up_at,
    -- migration 034's sentinel normalisation, baked in once instead of per query
    CASE WHEN u.last_activity < '2000-01-01'::timestamptz THEN NULL ELSE u.last_activity END AS last_active_at,
    u.trust_score,
    u.is_verified,
    u.is_banned,
    COALESCE(a.total_activities, 0)::bigint AS total_activities,
    COALESCE(a.active_days, 0)::bigint AS active_days,
    le.activity_type AS last_activity_type,
    le.detail AS last_activity_detail,
    le.occurred_at AS last_activity_occurred_at
  FROM dedup.users u
  LEFT JOIN agg a ON a.uid = u.id
  LEFT JOIN last_ev le ON le.uid = u.id
  WHERE u.is_bot = false;

-- Unique by construction (one row per dedup.users id). This view is ours -- the
-- external importer never writes to it -- so a unique index carries none of the
-- risk that rules them out on public.*.
CREATE UNIQUE INDEX idx_mv_all_users_roster_user_id ON mv_all_users_roster (user_id);

GRANT SELECT ON mv_all_users_roster TO service_role;


-- 2) The request-time function: filter + sort + paginate over 890 kB. No
--    dedup.* views, no LATERAL, no access to the big tables at all. Signature
--    unchanged, so CREATE OR REPLACE is safe and the app needs no code change.
--
--    days_since_signup and retention_score still use now(), so they stay live
--    and keep advancing correctly through the day -- only the counts and the
--    last-activity columns carry the nightly staleness that the rest of the
--    dashboard already has.
CREATE OR REPLACE FUNCTION analytics_all_users_engagement(
  search_text text DEFAULT NULL,
  signed_up_from timestamptz DEFAULT NULL,
  signed_up_to timestamptz DEFAULT NULL,
  last_active_from timestamptz DEFAULT NULL,
  last_active_to timestamptz DEFAULT NULL,
  activity_filter text DEFAULT 'all',
  sort_by text DEFAULT 'last_active',
  sort_dir text DEFAULT 'desc',
  page_number int DEFAULT 1,
  page_size int DEFAULT 50
)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  phone text,
  signed_up_at timestamptz,
  last_active_at timestamptz,
  trust_score numeric,
  is_verified boolean,
  is_banned boolean,
  total_activities bigint,
  active_days bigint,
  days_since_signup int,
  engagement_density numeric,
  retention_score numeric,
  last_activity_type text,
  last_activity_detail text,
  last_activity_occurred_at timestamptz,
  total_count bigint
)
LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    -- Clamp stays 10000 (not 200) so the CSV/XLSX export, which pages at 1000
    -- rows/page, fetches the whole filtered set instead of truncating.
    SELECT GREATEST(page_number, 1) AS pg_num, LEAST(GREATEST(page_size, 1), 10000) AS pg_size
  ),
  calc AS (
    SELECT r.*,
      GREATEST(1, (now()::date - r.signed_up_at::date)) AS days_since_signup_calc
    FROM mv_all_users_roster r
  ),
  scored AS (
    SELECT c.*,
      CASE WHEN c.active_days > 0
        THEN round(c.total_activities::numeric / c.active_days, 2) END AS engagement_density_calc,
      round(c.active_days::numeric / c.days_since_signup_calc, 3) AS retention_score_calc
    FROM calc c
  ),
  filtered AS (
    SELECT s.*, count(*) OVER ()::bigint AS total_count_calc
    FROM scored s
    WHERE (search_text IS NULL OR s.user_name ILIKE '%' || search_text || '%' OR s.phone ILIKE '%' || search_text || '%')
      AND (signed_up_from IS NULL OR s.signed_up_at >= signed_up_from)
      AND (signed_up_to IS NULL OR s.signed_up_at <= signed_up_to)
      AND (last_active_from IS NULL OR s.last_active_at >= last_active_from)
      AND (last_active_to IS NULL OR s.last_active_at <= last_active_to)
      AND (
        activity_filter = 'all'
        OR (activity_filter = 'active' AND s.total_activities > 0)
        OR (activity_filter = 'inactive' AND s.total_activities = 0)
      )
  ),
  ranked AS (
    SELECT f.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN sort_by = 'last_active' AND sort_dir = 'asc' THEN f.last_active_at END ASC NULLS LAST,
          CASE WHEN sort_by = 'last_active' AND sort_dir = 'desc' THEN f.last_active_at END DESC NULLS LAST,
          CASE WHEN sort_by = 'signed_up' AND sort_dir = 'asc' THEN f.signed_up_at END ASC NULLS LAST,
          CASE WHEN sort_by = 'signed_up' AND sort_dir = 'desc' THEN f.signed_up_at END DESC NULLS LAST,
          CASE WHEN sort_by = 'name' AND sort_dir = 'asc' THEN f.user_name END ASC NULLS LAST,
          CASE WHEN sort_by = 'name' AND sort_dir = 'desc' THEN f.user_name END DESC NULLS LAST,
          CASE WHEN sort_by = 'trust_score' AND sort_dir = 'asc' THEN f.trust_score END ASC NULLS LAST,
          CASE WHEN sort_by = 'trust_score' AND sort_dir = 'desc' THEN f.trust_score END DESC NULLS LAST,
          CASE WHEN sort_by = 'activities' AND sort_dir = 'asc' THEN f.total_activities END ASC NULLS LAST,
          CASE WHEN sort_by = 'activities' AND sort_dir = 'desc' THEN f.total_activities END DESC NULLS LAST,
          CASE WHEN sort_by = 'engagement_density' AND sort_dir = 'asc' THEN f.engagement_density_calc END ASC NULLS LAST,
          CASE WHEN sort_by = 'engagement_density' AND sort_dir = 'desc' THEN f.engagement_density_calc END DESC NULLS LAST,
          CASE WHEN sort_by = 'retention_score' AND sort_dir = 'asc' THEN f.retention_score_calc END ASC NULLS LAST,
          CASE WHEN sort_by = 'retention_score' AND sort_dir = 'desc' THEN f.retention_score_calc END DESC NULLS LAST,
          f.last_active_at DESC NULLS LAST
      ) AS rn
    FROM filtered f
  )
  SELECT
    r.user_id, r.user_name, r.phone, r.signed_up_at, r.last_active_at, r.trust_score,
    r.is_verified, r.is_banned, r.total_activities, r.active_days,
    r.days_since_signup_calc, r.engagement_density_calc, r.retention_score_calc,
    r.last_activity_type, r.last_activity_detail, r.last_activity_occurred_at,
    r.total_count_calc
  FROM ranked r, bounds b
  WHERE r.rn > (b.pg_num - 1) * b.pg_size AND r.rn <= b.pg_num * b.pg_size
  ORDER BY r.rn;
$$;

GRANT EXECUTE ON FUNCTION analytics_all_users_engagement(
  text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, int, int
) TO service_role;


-- 3) mv_user_engagement (046) is now subsumed -- the roster computes the same
--    aggregate inline. Dropped after the function above stopped referencing it.
DROP MATERIALIZED VIEW IF EXISTS mv_user_engagement;


-- 4) Swap the nightly refresh over to the roster. Re-registering under the same
--    name updates in place (migration 017's approach). Deliberately NOT
--    CONCURRENTLY, matching the rest of this batch: the unique index above
--    would allow it, but 017 was a night-after-night silent failure caused by
--    a REFRESH ... CONCURRENTLY that couldn't run, and a ~35s exclusive lock at
--    21:30 on an internal dashboard is not worth reintroducing that risk.
SELECT cron.schedule(
  'refresh-analytics-kpis',
  '30 21 * * *',
  $$
    REFRESH MATERIALIZED VIEW mv_all_users_roster;
    REFRESH MATERIALIZED VIEW mv_growth_kpis;
    REFRESH MATERIALIZED VIEW mv_pool_kpis;
    REFRESH MATERIALIZED VIEW mv_chat_kpis;
    REFRESH MATERIALIZED VIEW mv_trust_kpis;
    REFRESH MATERIALIZED VIEW mv_monetization_kpis;
    REFRESH MATERIALIZED VIEW mv_matching_kpis;
    REFRESH MATERIALIZED VIEW mv_ai_copilot_kpis;
    INSERT INTO analytics_refresh_log (view_name, refreshed_at)
    VALUES ('all', now())
    ON CONFLICT (view_name) DO UPDATE SET refreshed_at = now();
  $$
);
