# Picapool Analytics Dashboard

Internal Next.js dashboard over Picapool's existing Supabase Postgres project. KPI
tabs read nightly-refreshed materialized views plus a few live activity
breakdowns; the Data Explorer and Schema Browser read live tables.

**Note:** an AI Query panel (plain-English questions to SQL via Groq) was
built and then removed after it proved unreliable in practice (wrong
answers, provider errors). `analytics_ai_query_log` (migration `013`) and
the `analytics_readonly` role (migration `001`) are still in the schema
because the schema cache generator (used by the Schema Browser) also uses
that role's connection, but the AI query code itself and `groq-sdk` are
gone. The `GROQ_*` env vars are back, but scoped very differently: the
Telegram bot (see "Telegram daily updates" below) uses Groq only to
classify a free-text question into one of a small fixed set of already-
correct queries, never to generate SQL.

## Stack

Next.js 14 (App Router, TypeScript) · Supabase Postgres (existing project, no
separate warehouse) · Tailwind. No Metabase, Redis, BigQuery, ClickHouse,
Airbyte, Fivetran, dbt, or read replica.

## One-time setup

### 1. Install dependencies

```bash
npm install
```

### 2. Schema introspection (only needed once, locally)

This codebase has no built-in visibility into your actual table columns. Before
the materialized views can be written correctly:

1. Create `.env.local` (copy `.env.local.example`) and fill in
   `INTROSPECTION_DB_URL` with a Postgres connection string that can read
   `information_schema`/`pg_catalog`, e.g. the default `postgres` connection
   string from Supabase's **Project Settings → Database → Connection string**.
2. Run:
   ```bash
   npm run introspect-schema
   ```
   This writes `scripts/.schema-introspection.json` (gitignored; it contains
   real sample rows, never commit it).
3. Once done, you can remove `INTROSPECTION_DB_URL` from `.env.local`. It's
   not read by the deployed app.

### 3. Run the SQL migrations yourself in the Supabase SQL editor

In order, from `supabase/migrations/`:

| File | What it does |
|---|---|
| `001_analytics_readonly_role.sql` | Creates a read-only Postgres role, used by the schema cache generator (step 6) to introspect columns/samples. **Set a real password before running.** |
| `002_refresh_log_table.sql` | Creates `analytics_refresh_log`, which powers the "last refreshed" badge. |
| `003`–`009_mv_*_kpis.sql` | The 7 KPI materialized views (Growth, Pools, Chat, Trust, Monetization, Matching, AI/Copilot). |
| `010_pg_cron_schedule.sql` | Schedules the nightly refresh of all 7 views (enable the `pg_cron` extension first, under Database → Extensions). |
| `011_analytics_schema_cache.sql` | Creates the table that stores the Schema Browser's column/sample cache. |
| `012_analytics_rate_limits.sql` | Creates the table + function backing the Data Explorer's rate limiter (no Redis; a single atomic Postgres UPSERT instead). |
| `013_analytics_ai_query_log.sql` | Historical: backed the now-removed AI Query panel. Harmless to leave in place; drop `analytics_ai_query_log` yourself if you want it gone. |
| `014_restore_service_role_grants.sql` | Only needed if `service_role` is missing `USAGE` on the `public` schema in your project (it should have this by default on any fresh Supabase project; run this if you hit `permission denied for schema public` errors). |
| `015_activity_breakdown_functions.sql` | SQL functions backing the Overview page's activity widgets and the Growth/Activation/Engagement/Retention dashboards (DAU/WAU/MAU, new/active users per day, activity by hour, active users by proximity, feature adoption, activation funnel, retention cohorts). Called live via `.rpc()`, not nightly-refreshed. |
| `016_telegram_subscribers.sql` | Creates `analytics_telegram_subscribers`, which powers the daily Telegram "new data fetched" notifications (see "Telegram daily updates" below). |
| `017_fix_kpi_refresh_concurrency.sql` | Fixes the nightly refresh job from 010, which failed every night: `REFRESH ... CONCURRENTLY` requires a unique index on a real column, but the views' `(1)` expression indexes don't qualify, so the whole batch aborted and the views never refreshed. Drops `CONCURRENTLY`. |
| `018_dedup_views_fix_inflated_kpis.sql` | **Important context:** this project's tables are loaded from the production app DB by an external import with no primary keys/unique constraints, and overlapping import runs left nearly every row duplicated ~2-3x (e.g. 20,506 `users` rows but only 6,857 distinct ids), inflating every count-based KPI. Adds a `dedup` schema with one-row-per-production-PK views and rebuilds all 7 materialized views + the migration-015 functions on top of them, plus a new `analytics_dau_wau_mau()` function so DAU/WAU/MAU dedupe too. Does *not* delete the duplicate rows or add constraints, since that could break the external importer. |
| `019_active_users_unique_total.sql` | Fixes the Telegram bot's "Active users — last N days" reply, which summed `analytics_active_users_per_day()`'s daily distinct counts into a "Total" line — double-counting anyone active on more than one day in the range. Adds `analytics_active_users_total()`, a single distinct-across-the-whole-window count, used instead of the sum. |
| `020_exclude_bots_from_activity_metrics.sql` | Fixes bot/virtual-user accounts (the `vu_personas`/`bot_personas` pool-seeding system) being counted as active humans. `analytics_dau_wau_mau()` already filtered `is_bot = false`, but `analytics_active_users_per_day/_total`, `analytics_activity_by_hour`, `analytics_feature_adoption`, and the `mv_growth_kpis`/`mv_trust_kpis` "active users" fields computed distinct users straight from event tables without ever joining back to `users.is_bot`. |
| `021_ask_around_engaged_users.sql` | Adds `analytics_ask_around_users()`: distinct (non-bot) users who created or joined a pool in the `ask_around` category (`pools.category = 'ask_around'`), all-time. Backs the Telegram bot's "Ask Around users" button. |
| `022_ask_around_by_new_users.sql` | Adds `analytics_ask_around_by_new_users(days_back)`: of users who signed up in the last N days, how many created an Ask Around pool. Backs the Telegram bot's "Ask Around by new users" button (1/7/15/30-day range picker). |
| `023_ask_around_verification_breakdown.sql` | Adds a Digilocker-only / college-ID-only / both / neither verification breakdown for Ask Around pool creators, both all-time (`analytics_ask_around_creator_verification()`) and per-window (extends `analytics_ask_around_by_new_users()` with the same columns), plus a separate bot-creator count for visibility (bots stay excluded from the human breakdown itself). |
| `024_new_user_activity_timeline.sql` | Adds `analytics_new_user_activity_summary(days_back)` (per-activity-type counts for the new-user cohort: chat, pool joined, pool created, trust action) and `analytics_new_user_activity_detail(days_back, row_limit)` (one row per user/activity/timestamp event). Backs the new "New User Activity" dashboard page and the Telegram bot's "New user activity" button. |
| `025_pg_flat_intent_leads.sql` | Adds `analytics_pg_flat_leads()` and `analytics_pg_flat_leads_summary()`. **No tap/click event tracking exists anywhere in this data** — these use the closest real signals instead: PG search submissions (`pg_hunt_queries`), Flat listing creation (`pool_flat`), Flatmate listing creation (`pool_flatmate`). Backs the new "PG / Flat Leads" dashboard page (name + phone, CSV export) and a Telegram "PG/Flat leads" button (aggregate counts only — no names/phones sent to chat). |
| `026_new_user_locations.sql` | Adds `analytics_new_user_locations_detail(days_back, row_limit)` and `analytics_new_user_locations_summary(days_back)`. **No app-download/install event exists in this data either** — "downloaded" is treated as new-user signup (`users.created_at`), mapped to the nearest college within 5km (reusing migration 018's proximity logic), with unmatched users shown as "Unknown / no college nearby" so totals still reflect every signup. Backs the Overview page's "New users by location" chart, the new "New User Locations" dashboard page (name + phone + location + signup time, CSV export), and a Telegram "New users by location" button (1/7/15/30-day range picker, aggregate counts only — no names/phones sent to chat). |
| `027_new_user_locations_city_state.sql` | Re-`CREATE OR REPLACE`s `analytics_new_user_locations_detail()` so `location_label` reads "College, City, State" instead of just the college name (city/state pulled from `colleges.city`/`colleges.state` via the same nearest-college match). `analytics_new_user_locations_summary()` needed no change — it just groups by whatever label `_detail()` returns. Superseded by `028` below. |
| `028_new_user_locations_geocode.sql` | Drops the nearest-college proxy entirely (colleges in this data turned out to be Delhi-heavy, so most real-world signups showed as "Unknown"). `analytics_new_user_locations_detail()` now returns the raw signup lat/lng instead of a pre-built label; the actual "City, State" comes from reverse-geocoding that coordinate app-side via LocationIQ's free-tier API (`src/lib/geocoding/locationIq.ts`), cached by rounded coordinate in the new `analytics_geocode_cache` table (`src/lib/db/geocodeCache.ts`) so the same building/campus never re-calls the API twice. `analytics_new_user_locations_summary()` is dropped — aggregation by city/state now happens app-side too, in `getNewUserLocationsSummary()`. |
| `029_verified_users.sql` | Adds `analytics_verified_users_detail(date_from, date_to, search_text, college_search, row_limit)`: users verified via **both** Digilocker (`digilocker_accounts`) and college ID (`user_colleges.verification_status = 'verified'`), bots excluded, with name/phone search, college-name search, and a signup-date range all applied in SQL. Backs the new "Verified Users" dashboard page (name, college, trust score, signup/last-active, CSV export). |
| `030_new_user_activity_phone_and_housing.sql` | Two fixes to `analytics_new_user_activity_detail()`/`_summary()`: adds `phone` to the detail rows (shown on the dashboard table + CSV), and adds three activity branches that were entirely missing — PG search (`pg_hunt_queries`), Flat listing (`pool_flat`), Flatmate listing (`pool_flatmate`) — reusing the same joins already proven in migration 025. These also now count toward the "Did any activity" total, which previously undercounted PG-search-only users. |
| `031_all_users_directory.sql` | Adds `analytics_all_users_detail(search_text, signed_up_from, signed_up_to, last_active_from, last_active_to, sort_by, sort_dir, page_number, page_size)`: every (non-bot) user with signup ("installed") date, last visit (`users.last_activity`), and their single most recent tracked activity (via a per-page LATERAL join over the same signal tables as migration 030). Genuinely paginated (page/pageSize, capped at 200/page) since this covers the whole user base, not a small cohort. Backs the new "All Users" dashboard page (search, signup/last-active date filters, sort, CSV + `.xlsx` export). |
| `032_all_users_performance_indexes.sql` | Fixes `analytics_all_users_detail()` timing out in production ("canceling statement due to statement timeout"). This project's tables have no primary key or unique constraints anywhere (migration 018), so the per-page LATERAL lookup across chat/trust/pools/PG-search/flat/flatmate was a full sequential scan per table per page row. Adds plain (non-unique, non-constraining) indexes on the relevant filter columns — safe alongside migration 018's no-constraints policy since these add no constraint, just a lookup structure. Also speeds up every `dedup.*` view's `DISTINCT ON` dedup, and Verified Users' Digilocker/college joins. |
| `033_all_users_fix_lateral_perf.sql` | The indexes in 032 weren't enough on their own: `analytics_all_users_detail()`'s LATERAL queried the `dedup.*` views, which are `SELECT DISTINCT ON (id) … ORDER BY id` — forcing a full-table sort by `id` before the `sender_id = <user>` filter could apply, bypassing 032's indexes. Recreates the function so the LATERAL hits the `public.*` base tables directly (deduplication is irrelevant when only the single most-recent event via `LIMIT 1` is kept), turning each lookup into an index scan. `dedup.users` is still used for the user list/`total_count` so the roster stays deduped. Adds `idx_pools_id` for the pools-by-id joins inside the LATERAL. |
| `034_all_users_normalize_last_active.sql` | Fixes "Last active: 739817d ago" in All Users. Some users have a sentinel `last_activity` far in the past (year-0/epoch, not NULL) meaning "never active." Normalizes any `last_activity` before 2000-01-01 to NULL in a base CTE so the returned value, the last-active-date filter, and the sort all agree and such users read as "never" (sorted NULLS LAST). |
| `035_new_user_activity_chat_pool_name.sql` | New User Activity detail now shows which pool a chat message was sent in (`chat_messages.room_id` → `chat_rooms.pool_id` → `pools.title`, falling back to the room name / "Direct message" for non-pool DM rooms) instead of the useless `type` = "text". Also upgrades "Joined a pool" / "Created a pool" details to show the pool title rather than just its category. Joins via `dedup.*` so duplicate snapshots can't multiply a message into several rows. `CREATE OR REPLACE`, signature unchanged; the `detail` column already renders in the table + CSV, so no app change. |
| `036_new_user_activity_cap_by_users.sql` | `analytics_new_user_activity_detail()`'s `row_limit` now caps **users**, not events. Before, it returned the 500 most-recent *events*, which on an active day are consumed by a few power users in a single evening — so the table only showed a ~7-hour slice and everyone active earlier in the week was truncated off-page. Now it takes the N most-recently-active users and returns *all* their events, so every active user shows (newest first) with a complete activity count. Same body as 035; only the final SELECT changed. |
| `037_fix_clientside_aggregation_caps.sql` | Fixes three "silently capped at 1000 rows" bugs. This project's REST API has a default **Max rows = 1000** (Settings → API), so a bare supabase-js `.select()` (no `.range()`) returns at most 1000 rows. Two breakdowns read a *raw*, ~3× duplicated public table into JS and aggregated there, hitting that cap after only ~330 distinct rows and undercounting: **Top colleges** (`getTopCollegesByUsers`, Overview/Growth/Telegram) and **Pool completion by category** (`getPoolCompletionByCategory`, Pools/Telegram). Both move here into SQL functions on the `dedup.*` views — `analytics_top_colleges_by_users()` and `analytics_pool_completion_by_category()`. Also raises `analytics_all_users_detail()`'s `page_size` clamp from 200 → 10,000 so the **All Users CSV/XLSX export** (which requests 10,000 on one page) returns the whole filtered set instead of a silent 200-row truncation; the interactive table still requests 50/page. (The matching `.select()`-without-range caps in `geocodeCache` and `telegramSubscribers` are fixed app-side by pagination — no migration needed.) |

This codebase intentionally never runs these migrations for you. Creating
login roles and cron schedules are changes to your production database's
security/system configuration, which you should run yourself after reviewing
them. Before running `010`, enable the `pg_cron` extension (Database →
Extensions in the Supabase dashboard).

The 7 materialized views (`003`–`009`) and all KPI-tab breakdown charts are
written using the real, introspected schema: table/column names, enum
values (e.g. `flatmate_interaction_status`), and free-text status values
(e.g. `pools.status = 'closed'` for a completed pool) were all confirmed
against the live database, not guessed.

### 4. Create the shared Supabase Auth account

This app gates access with **one shared Supabase Auth account** (not
role-based tiers, per v1 scope). Create it yourself in the Supabase dashboard:
**Authentication → Users → Add user**, then share the email/password with your
team out of band. The app never creates or stores this account for you.

### 5. Env vars

Fill in `.env.local` (see `.env.local.example` for the full list):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: from your Supabase project settings.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only, never exposed to the browser. Used for all KPI/Explorer/Schema Browser reads (see "Why the service role key" below).
- `SUPABASE_READONLY_DB_URL`: the **pooled** (Supavisor, transaction mode, port `6543`, host like `aws-0-<region>.pooler.supabase.com`) connection string for the `analytics_readonly` role created in step 3, used by the schema cache generator. Not the direct `db.<ref>.supabase.co:5432` connection, which is IPv6-only and will fail to resolve on many networks.
- `CRON_SECRET`: any random string; Vercel Cron sends it as a bearer token when it hits `/api/schema-cache/refresh` weekly (see `vercel.json`).
- `SUPABASE_DB_CA_CERT`: optional. Raw `pg` connections verify the server certificate against Node's trusted CA store by default, which works out of the box against Supabase's endpoints. Only set this (to the CA cert's PEM contents from Project Settings → Database → SSL Configuration) if you hit a certificate-verification error.
- `LOCATIONIQ_API_KEY`: optional. Powers the "New User Locations" page/Telegram button's reverse geocoding (signup coordinate → city/state). Free tier at locationiq.com, no credit card. Without it, locations show as "Unknown location" — nothing else breaks.

### 6. Generate the schema cache

```bash
npm run generate-schema-cache
```

This populates `analytics_schema_cache` (table/column/type/row-count/size + a
few PII-redacted sample rows per table), which the Schema Browser reads from.
Re-run weekly, either manually, in CI, or automatically via the Vercel Cron
job already configured in `vercel.json` (requires `CRON_SECRET` to be set in
your Vercel project's env vars).

### 7. Run it

```bash
npm run dev
```

## Activity metrics are proxies, not a dedicated event log

There is no app-analytics event pipeline anywhere in this schema (no
session/screen-view/request tracking table exists). DAU/WAU/MAU, "active
users per day," "activity by hour," "feature adoption," the activation
funnel, and the retention cohorts (`src/lib/db/activityBreakdown.ts`,
migration `015`) are all built from real but indirect signals: a user
counts as "active" if they sent a chat message, recorded a trust action,
or joined a pool. That's genuine activity, just not the same thing as an
app-open or screen-view event. Deliberately **not** built, because there's
no real data to build them from: downloads/install trends (that's
app-store/attribution data, not in this Postgres database), average
session duration, and average requests per session (no session or
request-level logging exists here). `user_recording_quotas` has the right
shape for "time spent per screen" (`screen_route`, `seconds_used`) but
currently holds 1 row total, so it isn't wired up to a widget yet.

## Why the service role key (not RLS) for dashboard reads

Materialized views can't carry row-level security, and the Data Explorer/Schema
Browser need to see all 79 tables in full. Scoping through the `anon`/
`authenticated` PostgREST role with RLS would silently hide rows on any
production table that has per-user RLS policies. The service role key is used
**server-side only** (Server Components / Route Handlers), never sent to the
browser, for every read in this app.

## Security measures

- **Auth on every route.** `middleware.ts` gates all pages and API routes behind a valid Supabase Auth session, redirecting unauthenticated requests to `/login`.
- **Secrets stay server-side.** The service-role key is only ever imported by server-only modules (`src/lib/supabase/server.ts`, `src/lib/db/*`), never by a `"use client"` component. The browser only ever holds the anon key.
- **TLS certificate verification.** All raw `pg` connections verify the server certificate against Node's trusted CA store (`src/lib/db/pgSsl.ts`) rather than skipping verification.
- **Rate limiting.** `/api/explorer/[table]` (120 req/min) and its CSV/XLSX exports (10 req/min each) are limited per client IP via a Postgres-backed fixed-window limiter (`supabase/migrations/012`, `src/lib/security/rateLimit.ts`). No Redis needed. The same limiter also gates the Telegram webhook per chat_id: 5 password attempts per 5 minutes while unauthenticated, 30 button taps/min and 20 messages/min once subscribed.
- **Data Explorer table allowlist.** The `table` route param is checked against a fixed list of the 73 non-internal tables before any query runs (`src/lib/db/explorer.ts`). The 6 PostGIS/migration tables are unreachable through it, and column names in filters/sort are checked against the schema cache before being used.
- **PII redaction in the schema cache.** Sample values for any column matching `email|phone|password|token|secret|otp|aadhar|...` are redacted before being shown in the Schema Browser (`src/lib/db/refreshSchemaCache.ts`).
- **Cron endpoint gated.** `/api/schema-cache/refresh` requires a bearer token matching `CRON_SECRET`.
- **No secrets committed.** `.gitignore` excludes `.env*` and the raw schema-introspection JSON (which holds real, unredacted sample rows).

## Telegram daily updates

Anyone who messages the dashboard's Telegram bot is asked for a shared
password once; after that, `/api/telegram/notify-refresh` (a daily Vercel
Cron, `vercel.json`) messages them whenever the nightly KPI refresh runs.

Once subscribed, they can also pull numbers on demand — every metric on
every dashboard tab is covered, and every reply says what date/time it's
as of:

- **Button menu** (`/menu`, or automatically shown after verifying): DAU /
  WAU / MAU snapshot; "New users/day" and "Active users/day" with Last 1 /
  7 / 30 day range buttons; a "More activity metrics" submenu (activity by
  hour, active users by college, feature adoption, activation funnel,
  retention cohorts — same fixed 30-day/8-week windows as their dashboard
  pages, no range picker); and a "KPI dashboards" submenu with all 7 KPI
  tabs (Growth, Pools, Chat, Trust, Monetization, Matching, AI/Copilot),
  each rendering every field of that tab's materialized-view snapshot the
  same generic way `StatTileGrid` does on the dashboard itself. Live
  metrics are tagged "as of \<now\>"; KPI-tab metrics are tagged "as of
  \<nightly refresh time\>" from `analytics_refresh_log`, since those are
  nightly-refreshed, not live. Nothing bot-specific is computed — see
  `src/lib/telegram/intents.ts`.
- **Free-text questions** (e.g. "how many new users this week?", "signups
  last 3 days", "how's revenue looking"): Groq only picks a *category* out
  of that same fixed set (`classifyMetric`); it never picks a day count or
  writes a query. Any day count in the question ("3 days", "this week",
  "last month") is pulled out separately with plain regex
  (`extractDayCount`, defaults to 7 if none is stated), then run through
  the exact same parameterized query the range buttons use. If the
  category doesn't match, or `GROQ_API_KEY`/`GROQ_MODEL` aren't set, it
  falls back to the button menu instead of guessing. It never generates or
  runs its own SQL — that's the exact failure mode that got the old AI
  Query panel removed (see the note at the top of this file).

1. **Create the bot.** Message [@BotFather](https://t.me/BotFather) on
   Telegram, run `/newbot`, and copy the token it gives you into
   `TELEGRAM_BOT_TOKEN`.
2. **Set the other two env vars.** `TELEGRAM_BOT_PASSWORD` (whatever you want
   people to send the bot to subscribe) and `TELEGRAM_WEBHOOK_SECRET` (any
   random string) — see `.env.local.example`. Set all three in your Vercel
   project too, alongside `CRON_SECRET`.
3. **Run migration `016`** (see step 3 above) to create
   `analytics_telegram_subscribers`.
4. **Deploy**, then register the webhook so Telegram forwards messages to
   your deployed app (replace both placeholders):
   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -d "url=https://<your-vercel-domain>/api/telegram/webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```
5. **Message the bot** on Telegram and send the password you set in step 2.
   It'll confirm you're subscribed. From then on you'll get a message once a
   day, a few minutes after the nightly refresh (`21:45` UTC / `3:15 AM`
   IST — adjust the schedule in `vercel.json` if the refresh itself is
   taking longer than 15 minutes).

`/api/telegram/webhook` and `/api/telegram/notify-refresh` (like
`/api/schema-cache/refresh`) authenticate via their own header/bearer-token
check instead of the dashboard's Supabase Auth session, since Telegram and
Vercel Cron never carry that session cookie — `middleware.ts` explicitly
skips the session check for these three paths.

## Deploying

This repo is deploy-ready but deployment itself is left to you (connecting a
Vercel project involves your account/org). Push to a git repo, import it in
Vercel, and set all the env vars above in the Vercel project settings. The
weekly schema-cache-refresh cron in `vercel.json` will start firing once
`CRON_SECRET` is set there too.

## What's still pending after this build

- Run migrations `001`–`015` in the Supabase SQL editor, in order (see step 3).
- The 7 materialized views are populated immediately when created, but
  `analytics_refresh_log` stays empty (refresh badge shows "never") until
  either the nightly `pg_cron` job fires once, or you manually run the
  `INSERT INTO analytics_refresh_log ...` statement from `010` yourself
  right after creating everything.
- `npm run generate-schema-cache` needs `SUPABASE_READONLY_DB_URL` pointing at
  the real `analytics_readonly` pooled connection (not a placeholder) to run.
