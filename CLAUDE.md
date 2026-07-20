# CLAUDE.md — Picapool Analytics Dashboard

Guidance for working in this repo. Read this before adding pages, writing
SQL, or debugging "no data" issues — most of the non-obvious traps here
have already bitten someone and are documented below.

## What this is

Internal Next.js 14 (App Router, TypeScript) + Tailwind dashboard over
Picapool's existing Supabase Postgres project. KPI tabs read
nightly-refreshed materialized views; the Data Explorer, Schema Browser,
and the lead/user list pages read live tables via SQL functions called
through `supabase.rpc()`. No separate warehouse, no Redis, no dbt.

See `README.md` for full one-time setup (env vars, auth, the migration
table). This file is the "how to work here" companion.

## Architecture at a glance

- **Pages**: `src/app/(dashboard)/<name>/page.tsx` (server component,
  renders `KpiPageHeader` + a client view).
- **Client views**: `src/components/<feature>/<Feature>View.tsx` — fetch
  from `/api/<feature>` and render tables/filters/exports.
- **API routes**: `src/app/api/<feature>/route.ts` (JSON), `.../csv/route.ts`,
  `.../xlsx/route.ts`.
- **DB access**: `src/lib/db/<feature>.ts` — thin wrappers around
  `supabase.rpc("analytics_<...>", {...})`. Return `[]`/empty on error.
- **SQL**: `supabase/migrations/NNN_*.sql`. Every analytics function is
  `analytics_<name>(...)`, `LANGUAGE sql STABLE`, `GRANT EXECUTE ... TO
  service_role`.
- **Nav**: add new pages to `NAV_GROUPS` in
  `src/components/nav/Sidebar.tsx`.
- **Table→module map**: `src/lib/modules.ts` (drives Explorer + Schema
  Browser; also the allowlist of explorable tables).

## CRITICAL data-model facts (the source of most bugs)

1. **No primary keys, no unique constraints, no indexes anywhere.** The
   tables are loaded from the production app DB by an external import that
   re-inserts overlapping snapshots. Consequences:
   - **Nearly every row is duplicated ~2–3×.** Never `count(*)` raw public
     tables — you'll get ~3× inflation. Use the **`dedup.*` views**
     (migration 018): one row per production `id`. All KPI views and
     analytics functions are built on `dedup.*`.
   - **Do not add PK/unique constraints** — they could make the importer's
     next run fail. Plain non-unique **indexes are fine** (they add no
     constraint) and are how we fixed query timeouts (migration 032).

2. **`dedup.*` views defeat indexes in per-row lookups.** Each dedup view
   is `SELECT DISTINCT ON (id) * FROM public.<t> ORDER BY id`. In a
   correlated/LATERAL subquery filtering by e.g. `sender_id = <user>`,
   Postgres must materialize the full `DISTINCT ON (id)` sort *before* the
   filter, so your index on `(sender_id, ...)` is bypassed — catastrophic
   per-row. **Fix pattern**: in a LATERAL that only needs the most-recent
   row (`ORDER BY ts DESC LIMIT 1`), query `public.*` directly (dedup
   doesn't matter — `LIMIT 1` collapses duplicate snapshots). Keep
   `dedup.*` for the outer roster/counts. See migrations 031→033.

3. **No page-visit / time-on-screen / reel / watch-time tracking exists.**
   Not in any of the 73 tracked tables. Do **not** fabricate "time spent"
   or "reel" metrics. The closest *real* intent signals that do exist:
   - PG search = `pg_hunt_queries` (has notify_phone, budget, timing)
   - Flat listing created = `pool_flat`
   - Flatmate listing created = `pool_flatmate`
   - Pool joined/created = `pool_participants` / `pools`
   - Trust action = `trust_ledger`
   - Chat = `chat_messages` (but see #4)

4. **Sending a chat message IS how you join a pool.** So "sent a chat"
   overlaps almost entirely with "joined a pool" — don't present chat as an
   independent engagement metric (the standalone tile was removed from New
   User Activity for this reason). A chat message links to its pool via
   `chat_messages.room_id → chat_rooms.id`, `chat_rooms.pool_id → pools.id`,
   name in `pools.title` (or `chat_rooms.name` for non-pool DM rooms).

5. **"Installed" / "downloaded" = `users.created_at`.** There is no
   separate app-install/download event. Signup date is used as install date
   throughout.

6. **`users.last_activity` has sentinel values.** Some rows carry a
   year-0/epoch timestamp (not NULL) meaning "never active." Normalize
   `last_activity < '2000-01-01'` to NULL before displaying/sorting/
   filtering (migration 034), else it renders as "739817d ago" and sorts as
   a real oldest date.

7. **Bots**: exclude `dedup.users.is_bot = true` from all human metrics
   (the `vu_personas`/`bot_personas` virtual-user system, migration 020).

## Pages added in the recent work (session context)

All under Tools/Dashboards in the sidebar. Each has a JSON route + (where
it lists PII) CSV/XLSX exports rate-limited to 5/min.

- **Verified Users** (`/verified-users`, migration 029):
  `analytics_verified_users_detail(...)` — users verified via **both**
  Digilocker (`digilocker_accounts`) AND college
  (`user_colleges.verification_status='verified'`). Search name/phone +
  college, signup date range, CSV export.
- **New User Activity** (`/new-user-activity`, migrations 024, 030, 035,
  036): per-user grouped, expandable. Activity types: joined/created a
  pool, PG search, flat/flatmate listing, trust action (chat folded in,
  see #4). Detail shows the pool name. Capped **by users, not events**
  (036) so churned/earlier users aren't truncated off-page.
- **PG / Flat / Flatmate by User** (`/pg-flat-engagement`): reuses
  `/api/pg-flat-leads`, grouped per user, click to expand. No migration.
- **All Users** (`/all-users`, migrations 031–034): the whole (non-bot)
  user base, genuinely **paginated** (200/page cap in SQL). Signup date,
  last visit, most-recent tracked activity. Filters: search, signup range,
  last-active range. Sort by last active/signup/name/trust. CSV + XLSX.

Migration ledger (this work): 029 Verified Users · 030 New User Activity
phone + PG/flat/flatmate signals · 031 All Users directory · 032 perf
indexes · 033 LATERAL→public perf fix · 034 last_activity sentinel · 035
chat pool name · 036 cap-by-users. All documented in `README.md`'s
migration table.

## Operational gotchas

- **Migrations are never auto-run.** This repo intentionally does not run
  migrations against the DB. After merging any `supabase/migrations/*.sql`,
  it must be pasted into the **Supabase SQL editor** and run by hand before
  the feature returns data. "No data / 0 rows" almost always means the
  migration hasn't been applied.
- **New function returns empty right after creating it?** PostgREST caches
  its schema; a brand-new function may not be visible to `supabase.rpc()`
  yet. `NOTIFY pgrst, 'reload schema';` often does **not** propagate through
  the transaction-mode pooler — the reliable fix is **Project Settings →
  General → Restart project** (or the "Reload schema cache" button under
  Settings → API).
- **RPC wrappers log errors** (added this session): `console.error` before
  the empty-result fallback in `src/lib/db/*.ts`. If a page is empty, check
  Vercel runtime logs / `get_runtime_errors` for the real Postgres message
  before guessing — that's how the All Users `statement timeout` was found
  (don't assume "schema cache").
- **`statement_timeout`**: the SQL editor (postgres role) has a long/no
  timeout, but `service_role` via PostgREST has a short one. A query that
  "works in the editor" can still time out in the app — test performance,
  not just correctness.
- **Vercel MCP** (project `analytics-dashboard-pp`, team
  `latharrr's projects`): use `get_runtime_errors` / `get_runtime_logs` to
  diagnose production issues directly instead of guessing.

## Analytics-correctness lessons

- **Signup date ≠ last-activity date.** A user who signed up on day 1 and
  is still active on day 7 is *retained*, not mis-dated. Don't conflate.
- **Event-capped list tables are survivorship-biased.** Capping a detail
  table by the N most-recent *events* means a few power users on the latest
  day fill the budget and every earlier/churned user is hidden — making it
  look like "everyone is active today." Cap by **users** instead (036).
  Verified in this session: of ~650 new users in 7 days, 329 never did any
  activity and only ~60 were last active on the latest day; the rest were
  spread across the week.

## Conventions when adding a feature

- Mirror an existing feature end-to-end (page → view → api → lib/db → SQL).
- Exclude bots; use `dedup.*` for rosters/counts.
- Apply filters in **SQL** so the on-page view and CSV/XLSX export always
  agree (don't filter only client-side).
- PII exports (name/phone): rate-limit 5/min via `checkRateLimit`, matching
  PG/Flat Leads.
- Escape JSX literal quotes (`&ldquo;`/`&rdquo;`/`&rsquo;`) — the lint rule
  `react/no-unescaped-entities` will fail the build otherwise.
- Verify before pushing: `npm run typecheck`, `npm run lint`, and a full
  `npm run build` (build catches SSR/route issues the others miss). Env for
  a local build: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (placeholders are fine — build doesn't hit the
  DB).
- Document every new migration in the `README.md` migration table.
