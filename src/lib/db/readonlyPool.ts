import { Pool } from "pg";
import { getPgSsl } from "@/lib/db/pgSsl";

let pool: Pool | null = null;

/**
 * Pooled (Supavisor, transaction mode) connection authenticated as
 * analytics_readonly. Statement timeout is enforced at the role level
 * (see supabase/migrations/001_analytics_readonly_role.sql), not here.
 * This is the only place in the app that executes AI-generated SQL.
 */
export function getReadonlyPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.SUPABASE_READONLY_DB_URL;
  if (!connectionString) {
    throw new Error("SUPABASE_READONLY_DB_URL is not set");
  }

  pool = new Pool({
    connectionString,
    ssl: getPgSsl(),
    max: 5,
    // Client-side backstop; the role itself is also set to
    // statement_timeout = '10s' at the database level (migration 001).
    statement_timeout: 10_000,
    query_timeout: 10_000,
  });
  return pool;
}
