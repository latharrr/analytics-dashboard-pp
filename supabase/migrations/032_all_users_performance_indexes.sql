-- Performance fix for analytics_all_users_detail() (migration 031),
-- which timed out in production ("canceling statement due to statement
-- timeout" on /api/all-users). This project's tables have no primary
-- key or unique constraints anywhere (migration 018: an external import
-- process re-inserts overlapping snapshots, and constraints could break
-- it) — but a plain, non-unique index adds no constraint at all, so
-- these are safe to add without any risk to that importer.
--
-- Two things were slow without indexes:
--  1. dedup.users (and every other dedup.* view, migration 018) does
--     `DISTINCT ON (id) ... ORDER BY id, updated_at DESC NULLS LAST`
--     over the full table on every call, forcing a full sort. An index
--     on (id, updated_at DESC) turns that into an index scan — this
--     helps every function that reads dedup.users, not just this one.
--  2. analytics_all_users_detail()'s per-page LATERAL join looks up each
--     user's most recent activity via `WHERE sender_id = <user>` (etc.)
--     across chat_messages, trust_ledger, pool_participants, pools,
--     pg_hunt_queries, pool_flat, and pool_flatmate. Without an index on
--     those filter columns, each lookup is a full sequential scan,
--     repeated once per row on the page (e.g. 50 page rows x 7 tables =
--     350 sequential scans per request). Indexing those columns turns
--     each into an index scan instead.
--
-- Plain (non-concurrent) CREATE INDEX is fine here: this is an
-- analytics-only replica, not the traffic-serving production database,
-- so a brief write lock during index build has no user-facing impact.

CREATE INDEX IF NOT EXISTS idx_users_id_updated_at ON public.users (id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id_created_at ON public.chat_messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trust_ledger_user_id_created_at ON public.trust_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pool_participants_user_id ON public.pool_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_pool_participants_pool_id ON public.pool_participants (pool_id);
CREATE INDEX IF NOT EXISTS idx_pools_creator_id_created_at ON public.pools (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pg_hunt_queries_user_id ON public.pg_hunt_queries (user_id);
CREATE INDEX IF NOT EXISTS idx_pool_flat_created_by ON public.pool_flat (created_by);
CREATE INDEX IF NOT EXISTS idx_pool_flatmate_pool_id ON public.pool_flatmate (pool_id);

-- Also helps: dedup.digilocker_accounts / dedup.user_colleges (used by
-- Verified Users, migration 029) and dedup.colleges join, same DISTINCT
-- ON cost as (1) above.
CREATE INDEX IF NOT EXISTS idx_digilocker_accounts_user_id_updated_at ON public.digilocker_accounts (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_colleges_user_id_updated_at ON public.user_colleges (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_colleges_college_id ON public.user_colleges (college_id);
