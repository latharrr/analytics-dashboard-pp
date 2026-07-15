-- Read-only Postgres role used by the AI query executor (/api/ai-query).
-- Run this once in the Supabase SQL editor. Replace the password, then use
-- the pooled (Supavisor, transaction mode) connection string for this role
-- as SUPABASE_READONLY_DB_URL in the app's env vars.
CREATE ROLE analytics_readonly WITH LOGIN PASSWORD '<set-a-strong-password>';
GRANT USAGE ON SCHEMA public TO analytics_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analytics_readonly;
ALTER ROLE analytics_readonly SET statement_timeout = '10s';
