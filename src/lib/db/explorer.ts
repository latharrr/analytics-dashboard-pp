import { getServiceClient } from "@/lib/supabase/server";
import { ALL_TRACKED_TABLES } from "@/lib/modules";

const TEXT_TYPES = new Set(["text", "character varying", "character", "uuid", "citext", "name"]);

export function isExplorableTable(table: string): boolean {
  return ALL_TRACKED_TABLES.includes(table);
}

export interface QueryTableOptions {
  page: number;
  pageSize: number;
  sortColumn?: string;
  sortDir?: "asc" | "desc";
  filters: Record<string, string>;
  /** column name -> Postgres data_type, from the schema cache. */
  columnTypes: Record<string, string>;
}

export interface QueryTableResult {
  rows: Record<string, unknown>[];
  count: number;
}

export async function queryTable(
  table: string,
  { page, pageSize, sortColumn, sortDir, filters, columnTypes }: QueryTableOptions
): Promise<QueryTableResult> {
  if (!isExplorableTable(table)) {
    throw new Error(`Table "${table}" is not explorable`);
  }

  const supabase = getServiceClient();
  let query = supabase.from(table).select("*", { count: "exact" });

  for (const [column, value] of Object.entries(filters)) {
    if (!value) continue;
    if (!(column in columnTypes)) continue; // ignore unknown columns defensively
    const type = columnTypes[column];
    if (TEXT_TYPES.has(type)) {
      query = query.ilike(column, `%${value}%`);
    } else {
      query = query.eq(column, value);
    }
  }

  if (sortColumn && sortColumn in columnTypes) {
    query = query.order(sortColumn, { ascending: sortDir !== "desc" });
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return { rows: data ?? [], count: count ?? 0 };
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const str = typeof value === "object" ? JSON.stringify(value) : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ];
  return lines.join("\n");
}
