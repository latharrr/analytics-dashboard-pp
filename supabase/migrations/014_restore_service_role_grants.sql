-- Every Supabase project grants service_role full access to the public
-- schema by default (it already bypasses RLS, rolbypassrls = true, but
-- still needs the schema-level USAGE/SELECT grants underneath that).
-- This project's service_role is currently missing USAGE on `public`
-- entirely (confirmed via has_schema_privilege('service_role','public','USAGE')
-- returning false), which blocks every KPI tab, Data Explorer, and Schema
-- Browser read, all of which go through the service-role key by design
-- (see README "Why the service role key"). This migration restores the
-- standard default rather than introducing new privileges beyond what a
-- fresh Supabase project already has.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
