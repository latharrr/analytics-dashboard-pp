/**
 * Postgres data_type groupings shared between server code (src/lib/db/explorer.ts)
 * and client components (DataTable). Kept dependency-free so the client
 * bundle never pulls in server-only modules (supabase service client, xlsx).
 */
export const NUMERIC_TYPES = new Set([
  "integer",
  "bigint",
  "smallint",
  "numeric",
  "real",
  "double precision",
  "decimal",
]);

export const DATE_TYPES = new Set(["date", "timestamp with time zone", "timestamp without time zone"]);
