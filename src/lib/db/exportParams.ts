import type { NextRequest } from "next/server";
import type { DateRangeFilter } from "@/lib/db/explorer";

const RESERVED_EXPORT_PARAMS = new Set(["sort", "dir", "dateColumn", "dateFrom", "dateTo"]);

export interface ExportParams {
  sortColumn?: string;
  sortDir?: "asc" | "desc";
  filters: Record<string, string>;
  dateRange?: DateRangeFilter;
}

/** Shared query-param parsing for the CSV and XLSX export routes, so both stay in sync. */
export function parseExportParams(request: NextRequest): ExportParams {
  const searchParams = request.nextUrl.searchParams;
  const sortColumn = searchParams.get("sort") ?? undefined;
  const sortDir = (searchParams.get("dir") as "asc" | "desc" | null) ?? undefined;
  const dateColumn = searchParams.get("dateColumn");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const filters: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (!RESERVED_EXPORT_PARAMS.has(key)) filters[key] = value;
  }

  return {
    sortColumn,
    sortDir,
    filters,
    dateRange: dateColumn ? { column: dateColumn, from: dateFrom ?? undefined, to: dateTo ?? undefined } : undefined,
  };
}
