import { getServiceClient } from "@/lib/supabase/server";
import type { SchemaCachePayload } from "@/lib/db/refreshSchemaCache";

/** Reads the last-generated schema cache. Returns null if it's never been built yet. */
export async function getSchemaCache(): Promise<SchemaCachePayload | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("analytics_schema_cache")
    .select("payload")
    .eq("id", "v1")
    .maybeSingle();

  if (error) {
    console.error("getSchemaCache failed:", error.message);
    return null;
  }
  return (data?.payload as SchemaCachePayload) ?? null;
}

/** column name -> Postgres data_type for one table, or {} if the cache has no entry yet. */
export async function getColumnTypesForTable(table: string): Promise<Record<string, string>> {
  const cache = await getSchemaCache();
  const entry = cache?.tables.find((t) => t.table === table);
  if (!entry) return {};
  return Object.fromEntries(entry.columns.map((c) => [c.name, c.type]));
}
