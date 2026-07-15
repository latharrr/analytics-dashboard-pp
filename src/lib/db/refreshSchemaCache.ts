import { Client } from "pg";
import { getServiceClient } from "@/lib/supabase/server";
import { getPgSsl } from "@/lib/db/pgSsl";
import { ALL_KNOWN_RELATIONS, EXCLUDED_TABLES, moduleForTable } from "@/lib/modules";

/** Column names whose sample values are never sent to the LLM or shown in the schema browser. */
const PII_COLUMN_PATTERN =
  /email|phone|password|token|secret|otp|aadhar|aadhaar|pan_number|ssn|dob|date_of_birth/i;

export interface CachedColumn {
  name: string;
  type: string;
  nullable: boolean;
}

export interface CachedTable {
  table: string;
  module: string;
  row_count: number;
  size_pretty: string;
  columns: CachedColumn[];
  sample_rows: Record<string, unknown>[];
  /** Postgres/PostGIS internals and migration bookkeeping: not business data. */
  excluded: boolean;
}

export interface SchemaCachePayload {
  generated_at: string;
  tables: CachedTable[];
}

function redactRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = PII_COLUMN_PATTERN.test(key) ? "[redacted]" : value;
  }
  return out;
}

/**
 * Rebuilds the schema cache by introspecting `public` via the read-only
 * analytics role, then upserts it through the service-role client (the
 * readonly role can only SELECT, so it can't write the cache itself).
 */
export async function refreshSchemaCache(): Promise<SchemaCachePayload> {
  const connectionString = process.env.SUPABASE_READONLY_DB_URL;
  if (!connectionString) {
    throw new Error("SUPABASE_READONLY_DB_URL is not set");
  }

  const client = new Client({ connectionString, ssl: getPgSsl() });
  await client.connect();

  const tables: CachedTable[] = [];

  try {
    // Matched by name against the 79 known relations (73 business tables +
    // 6 excluded internals, 2 of which (geography_columns/geometry_columns)
    // are PostGIS-provided VIEWs, not BASE TABLEs, so a table_type filter
    // alone would miss them and undercount vs. Supabase's own dashboard).
    const tableNamesRes = await client.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public' and table_name = ANY($1)
       order by table_name`,
      [ALL_KNOWN_RELATIONS]
    );

    for (const { table_name: tableName } of tableNamesRes.rows) {
      const excluded = EXCLUDED_TABLES.includes(tableName);

      const columnsRes = await client.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `select column_name, data_type, is_nullable
         from information_schema.columns
         where table_schema = 'public' and table_name = $1
         order by ordinal_position`,
        [tableName]
      );

      let rowCount = 0;
      try {
        const countRes = await client.query(`select count(*)::bigint as count from "${tableName}"`);
        rowCount = Number(countRes.rows[0].count);
      } catch (err) {
        console.warn(`row count failed for ${tableName}:`, (err as Error).message);
      }

      let sizePretty = "unknown";
      try {
        const sizeRes = await client.query(
          `select pg_size_pretty(pg_total_relation_size($1)) as pretty`,
          [`public.${tableName}`]
        );
        sizePretty = sizeRes.rows[0].pretty;
      } catch (err) {
        console.warn(`size failed for ${tableName}:`, (err as Error).message);
      }

      let sampleRows: Record<string, unknown>[] = [];
      if (!excluded) {
        try {
          const sampleRes = await client.query(`select * from "${tableName}" limit 3`);
          sampleRows = sampleRes.rows.map(redactRow);
        } catch (err) {
          console.warn(`sample failed for ${tableName}:`, (err as Error).message);
        }
      }

      tables.push({
        table: tableName,
        module: excluded ? "excluded" : moduleForTable(tableName)?.key ?? "other",
        row_count: rowCount,
        size_pretty: sizePretty,
        columns: columnsRes.rows.map((c) => ({
          name: c.column_name,
          type: c.data_type,
          nullable: c.is_nullable === "YES",
        })),
        sample_rows: sampleRows,
        excluded,
      });
    }
  } finally {
    await client.end();
  }

  const payload: SchemaCachePayload = {
    generated_at: new Date().toISOString(),
    tables,
  };

  const supabase = getServiceClient();
  const { error } = await supabase
    .from("analytics_schema_cache")
    .upsert({ id: "v1", payload, generated_at: payload.generated_at });
  if (error) {
    throw new Error(`failed to persist schema cache: ${error.message}`);
  }

  return payload;
}
