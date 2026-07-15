/**
 * One-off local script: dumps table/column/type/row-count/size + a few
 * sample rows for every table in `public`, so the actual schema (which
 * this codebase has no other visibility into) can inform the KPI
 * materialized views and the AI query engine's schema cache.
 *
 * Reads INTROSPECTION_DB_URL from .env.local. Read-only: only ever issues
 * SELECT statements against catalog views and `SELECT ... LIMIT 3`.
 *
 * Run with: npm run introspect-schema
 * Output: scripts/.schema-introspection.json (gitignored; may contain
 * real sample data, never commit it).
 */
import { Client } from "pg";
import { writeFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { getPgSsl } from "../src/lib/db/pgSsl";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

function isPlaceholder(value: string | undefined): value is undefined {
  return !value || value.includes("your-password") || value.includes("your-project");
}

// Prefer a dedicated introspection connection, but fall back to the
// analytics_readonly pooled connection if migration 001 has already been
// run; that role can read information_schema/pg_catalog by default too.
let connectionString: string | undefined = process.env.INTROSPECTION_DB_URL;
if (isPlaceholder(connectionString)) {
  connectionString = process.env.SUPABASE_READONLY_DB_URL;
  if (!isPlaceholder(connectionString)) {
    console.log("INTROSPECTION_DB_URL not set. Using SUPABASE_READONLY_DB_URL (analytics_readonly) instead.\n");
  }
}

if (isPlaceholder(connectionString)) {
  console.error(
    "Neither INTROSPECTION_DB_URL nor SUPABASE_READONLY_DB_URL is set to a real connection string in .env.local."
  );
  process.exit(1);
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface TableInfo {
  table_name: string;
  row_count: number;
  size_bytes: number;
  size_pretty: string;
  columns: ColumnInfo[];
  sample_rows: Record<string, unknown>[];
}

async function main() {
  const client = new Client({ connectionString, ssl: getPgSsl() });
  await client.connect();

  const tablesRes = await client.query<{ table_name: string }>(
    `select table_name
     from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`
  );

  const tables: TableInfo[] = [];

  for (const { table_name } of tablesRes.rows) {
    const columnsRes = await client.query<ColumnInfo>(
      `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
       where table_schema = 'public' and table_name = $1
       order by ordinal_position`,
      [table_name]
    );

    let rowCount = 0;
    try {
      const countRes = await client.query(
        `select count(*)::bigint as count from "${table_name}"`
      );
      rowCount = Number(countRes.rows[0].count);
    } catch (err) {
      console.warn(`count failed for ${table_name}:`, (err as Error).message);
    }

    let sizeBytes = 0;
    let sizePretty = "unknown";
    try {
      const sizeRes = await client.query(
        `select pg_total_relation_size($1) as bytes, pg_size_pretty(pg_total_relation_size($1)) as pretty`,
        [`public.${table_name}`]
      );
      sizeBytes = Number(sizeRes.rows[0].bytes);
      sizePretty = sizeRes.rows[0].pretty;
    } catch (err) {
      console.warn(`size failed for ${table_name}:`, (err as Error).message);
    }

    let sampleRows: Record<string, unknown>[] = [];
    try {
      const sampleRes = await client.query(`select * from "${table_name}" limit 3`);
      sampleRows = sampleRes.rows;
    } catch (err) {
      console.warn(`sample failed for ${table_name}:`, (err as Error).message);
    }

    tables.push({
      table_name,
      row_count: rowCount,
      size_bytes: sizeBytes,
      size_pretty: sizePretty,
      columns: columnsRes.rows,
      sample_rows: sampleRows,
    });

    console.log(`introspected ${table_name} (${rowCount} rows, ${sizePretty})`);
  }

  await client.end();

  const outPath = path.resolve(process.cwd(), "scripts/.schema-introspection.json");
  writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), tables }, null, 2));
  console.log(`\nWrote ${tables.length} tables to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
