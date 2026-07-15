# Picapool Analytics Dashboard + AI Query Engine

Internal Next.js dashboard over Picapool's existing Supabase Postgres project. KPI
tabs read nightly-refreshed materialized views; the Data Explorer and Schema
Browser read live tables; the AI Query panel turns plain-English questions into
read-only SQL via Groq.

## Stack

Next.js 14 (App Router, TypeScript) · Supabase Postgres (existing project, no
separate warehouse) · Groq for text-to-SQL · Tailwind. No Metabase, Redis,
BigQuery, ClickHouse, Airbyte, Fivetran, dbt, or read replica.

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
| `001_analytics_readonly_role.sql` | Creates the read-only Postgres role the AI query executor uses. **Set a real password before running.** |
| `002_refresh_log_table.sql` | Creates `analytics_refresh_log`, which powers the "last refreshed" badge. |
| `003`–`009_mv_*_kpis.sql` | The 7 KPI materialized views (Growth, Pools, Chat, Trust, Monetization, Matching, AI/Copilot). |
| `010_pg_cron_schedule.sql` | Schedules the nightly refresh of all 7 views (enable the `pg_cron` extension first, under Database → Extensions). |
| `011_analytics_schema_cache.sql` | Creates the table that stores the AI query engine's schema-context cache. |
| `012_analytics_rate_limits.sql` | Creates the table + function backing the app's rate limiter (no Redis; a single atomic Postgres UPSERT instead). |
| `013_analytics_ai_query_log.sql` | Creates `analytics_ai_query_log`, used instead of `copilot_chats`/`copilot_messages`. See the comment in that file for why (short version: `copilot_chats.admin_id` is a NOT NULL FK into `users` for an existing in-app admin-copilot feature; this dashboard's shared login has no corresponding `users.id` to attach). |
| `014_restore_service_role_grants.sql` | Only needed if `service_role` is missing `USAGE` on the `public` schema in your project (it should have this by default on any fresh Supabase project; run this if you hit `permission denied for schema public` errors). |
| `015_activity_breakdown_functions.sql` | SQL functions backing the Overview page's activity widgets and the Growth/Activation/Engagement/Retention dashboards (DAU/WAU/MAU, new/active users per day, activity by hour, active users by proximity, feature adoption, activation funnel, retention cohorts). Called live via `.rpc()`, not nightly-refreshed. |

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
- `SUPABASE_READONLY_DB_URL`: the **pooled** (Supavisor, transaction mode, port `6543`, host like `aws-0-<region>.pooler.supabase.com`) connection string for the `analytics_readonly` role created in step 3. Not the direct `db.<ref>.supabase.co:5432` connection, which is IPv6-only and will fail to resolve on many networks.
- `GROQ_API_KEY`, `GROQ_MODEL`: Groq is used instead of Claude/OpenAI for text-to-SQL (the user's own infrastructure preference). Default model is `llama-3.3-70b-versatile`; change `GROQ_MODEL` to swap.
- `CRON_SECRET`: any random string; Vercel Cron sends it as a bearer token when it hits `/api/schema-cache/refresh` weekly (see `vercel.json`).
- `SUPABASE_DB_CA_CERT`: optional. Raw `pg` connections verify the server certificate against Node's trusted CA store by default, which works out of the box against Supabase's endpoints. Only set this (to the CA cert's PEM contents from Project Settings → Database → SSL Configuration) if you hit a certificate-verification error.

### 6. Generate the schema cache

```bash
npm run generate-schema-cache
```

This populates `analytics_schema_cache` (table/column/type/row-count/size + a
few PII-redacted sample rows per table), which both the Schema Browser and the
AI query engine's prompt context read from. Re-run weekly, either manually,
in CI, or automatically via the Vercel Cron job already configured in
`vercel.json` (requires `CRON_SECRET` to be set in your Vercel project's env vars).

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
browser. The AI query executor is the one exception: it runs arbitrary
AI-generated SQL, so it's isolated to the separate, hard-scoped,
statement-timeout-limited `analytics_readonly` Postgres role instead.

## Security measures

- **Auth on every route.** `middleware.ts` gates all pages and API routes behind a valid Supabase Auth session, redirecting unauthenticated requests to `/login`.
- **Secrets stay server-side.** The service-role key and the `analytics_readonly` DB connection string are only ever imported by server-only modules (`src/lib/supabase/server.ts`, `src/lib/db/*`), never by a `"use client"` component. The browser only ever holds the anon key.
- **AI-generated SQL is never trusted, only validated.** `src/lib/ai/sqlGuard.ts` structurally checks the SQL text itself (rejects multi-statement input, blocklists write keywords, requires the statement to start with `SELECT`/`WITH`, injects `LIMIT 1000`). This holds even if the model is prompt-injected into ignoring its instructions, because the check runs on the literal output, not on trusting the model's intent. Execution then goes through `analytics_readonly`, a Postgres role with `SELECT`-only grants and a 10s `statement_timeout`.
- **TLS certificate verification.** All raw `pg` connections verify the server certificate against Node's trusted CA store (`src/lib/db/pgSsl.ts`) rather than skipping verification.
- **Rate limiting.** `/api/ai-query` (20 req/min), `/api/explorer/[table]` (120 req/min), and its CSV export (10 req/min) are all limited per client IP via a Postgres-backed fixed-window limiter (`supabase/migrations/012`, `src/lib/security/rateLimit.ts`). No Redis needed.
- **CSRF.** `/api/ai-query` rejects POSTs whose `Origin` header doesn't match the app's own host (`src/lib/security/originCheck.ts`), on top of the session cookie's `SameSite=Lax` default.
- **Data Explorer table allowlist.** The `table` route param is checked against a fixed list of the 73 non-internal tables before any query runs (`src/lib/db/explorer.ts`). The 6 PostGIS/migration tables are unreachable through it, and column names in filters/sort are checked against the schema cache before being used.
- **PII redaction in the AI schema cache.** Sample values for any column matching `email|phone|password|token|secret|otp|aadhar|...` are redacted before being sent to Groq or shown in the Schema Browser (`src/lib/db/refreshSchemaCache.ts`).
- **Cron endpoint gated.** `/api/schema-cache/refresh` requires a bearer token matching `CRON_SECRET`.
- **No secrets committed.** `.gitignore` excludes `.env*` and the raw schema-introspection JSON (which holds real, unredacted sample rows).

## Deploying

This repo is deploy-ready but deployment itself is left to you (connecting a
Vercel project involves your account/org). Push to a git repo, import it in
Vercel, and set all the env vars above in the Vercel project settings. The
weekly schema-cache-refresh cron in `vercel.json` will start firing once
`CRON_SECRET` is set there too.

## What's still pending after this build

- Run migrations `001`–`013` in the Supabase SQL editor, in order (see step 3).
- The 7 materialized views are populated immediately when created, but
  `analytics_refresh_log` stays empty (refresh badge shows "never") until
  either the nightly `pg_cron` job fires once, or you manually run the
  `INSERT INTO analytics_refresh_log ...` statement from `010` yourself
  right after creating everything.
- `npm run generate-schema-cache` needs `SUPABASE_READONLY_DB_URL` pointing at
  the real `analytics_readonly` pooled connection (not a placeholder) to run.
