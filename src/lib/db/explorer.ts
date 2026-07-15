import * as XLSX from "xlsx";
import { getServiceClient } from "@/lib/supabase/server";
import { ALL_TRACKED_TABLES } from "@/lib/modules";
import { DATE_TYPES } from "@/lib/columnTypeGroups";

const TEXT_TYPES = new Set(["text", "character varying", "character", "uuid", "citext", "name"]);

export function isExplorableTable(table: string): boolean {
  return ALL_TRACKED_TABLES.includes(table);
}

export interface DateRangeFilter {
  column: string;
  from?: string;
  to?: string;
}

export interface QueryTableOptions {
  page: number;
  pageSize: number;
  sortColumn?: string;
  sortDir?: "asc" | "desc";
  filters: Record<string, string>;
  /** column name -> Postgres data_type, from the schema cache. */
  columnTypes: Record<string, string>;
  dateRange?: DateRangeFilter;
}

export interface QueryTableResult {
  rows: Record<string, unknown>[];
  count: number;
}

export async function queryTable(
  table: string,
  { page, pageSize, sortColumn, sortDir, filters, columnTypes, dateRange }: QueryTableOptions
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

  if (dateRange?.column && dateRange.column in columnTypes && DATE_TYPES.has(columnTypes[dateRange.column])) {
    if (dateRange.from) query = query.gte(dateRange.column, dateRange.from);
    if (dateRange.to) query = query.lte(dateRange.column, dateRange.to);
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

/** Builds a real .xlsx workbook buffer (one sheet) from query result rows. */
export function toXlsxBuffer(rows: Record<string, unknown>[], sheetName: string): Buffer {
  const cellSafeRows = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = value !== null && typeof value === "object" ? JSON.stringify(value) : value;
    }
    return out;
  });
  const sheet = XLSX.utils.json_to_sheet(cellSafeRows);
  const workbook = XLSX.utils.book_new();
  // Sheet names are capped at 31 chars and can't contain []:*?/\ in Excel.
  const safeSheetName = sheetName.replace(/[[\]:*?/\\]/g, "_").slice(0, 31);
  XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName || "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
