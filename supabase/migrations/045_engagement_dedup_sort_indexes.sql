-- Performance fix for analytics_all_users_engagement() (migration 044),
-- which times out in production ("canceling statement due to statement
-- timeout" on /api/all-users, confirmed via Vercel runtime logs).
--
-- The function's `ev` CTE unions six dedup.* views (chat_messages,
-- trust_ledger, pool_participants, pools, pool_flat, pool_flatmate) plus
-- an inline-deduped pg_hunt_queries, to get an accurate (non-triplicated)
-- total_activities/active_days count per user across the WHOLE table --
-- unlike a per-row LATERAL lookup, this can't be collapsed with LIMIT 1,
-- so the dedup is unavoidable here.
--
-- Every dedup.* view is `SELECT DISTINCT ON (id) * FROM public.<t>
-- ORDER BY id[, updated_at DESC NULLS LAST]` (migration 018). With no
-- index matching that ORDER BY, Postgres must fully sort each table on
-- every single page load. Migration 032 already indexed these same
-- tables, but only on their *filter* columns (sender_id, user_id,
-- creator_id, ...) for the old function's per-row LATERAL lookups --
-- none of those match the (id) / (id, updated_at) sort key this
-- aggregate CTE needs. Same fix pattern as 032: a plain non-unique index
-- matching the dedup ORDER BY turns the sort into an index scan. No
-- PK/unique constraint is added, so the external importer is unaffected.

CREATE INDEX IF NOT EXISTS idx_chat_messages_id_updated_at ON public.chat_messages (id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pools_id_updated_at ON public.pools (id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_trust_ledger_id ON public.trust_ledger (id);
CREATE INDEX IF NOT EXISTS idx_pool_participants_id ON public.pool_participants (id);
CREATE INDEX IF NOT EXISTS idx_pool_flat_id ON public.pool_flat (id);
CREATE INDEX IF NOT EXISTS idx_pool_flatmate_id ON public.pool_flatmate (id);
CREATE INDEX IF NOT EXISTS idx_pg_hunt_queries_id ON public.pg_hunt_queries (id);
