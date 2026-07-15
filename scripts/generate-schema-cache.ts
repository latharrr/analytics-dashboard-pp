/**
 * Run with: npm run generate-schema-cache
 * Rebuilds the schema cache (table/column/type/row-count/size + redacted
 * samples) used by the AI query engine and the Schema Browser, and stores
 * it in the `analytics_schema_cache` table. Intended to run weekly, either
 * manually, in CI, or via the /api/schema-cache/refresh route on a Vercel
 * Cron schedule (see vercel.json).
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const { refreshSchemaCache } = await import("../src/lib/db/refreshSchemaCache");
  const payload = await refreshSchemaCache();
  console.log(`Cached ${payload.tables.length} tables at ${payload.generated_at}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
