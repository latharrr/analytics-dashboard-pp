-- Cache of table/column/type/row-count/size + a couple of redacted sample
-- rows per table, used as schema context for the AI query engine's
-- text-to-SQL prompt and for the Schema Browser page. Regenerated weekly
-- (see scripts/generate-schema-cache.ts and api/schema-cache/refresh).
-- Written by the service role (bypasses RLS by design), read by the app.
CREATE TABLE IF NOT EXISTS analytics_schema_cache (
  id text PRIMARY KEY DEFAULT 'v1',
  payload jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);
