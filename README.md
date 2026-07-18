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
