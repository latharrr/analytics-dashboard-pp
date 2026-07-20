import type { NextRequest } from "next/server";
import type { DateRangeFilter } from "@/lib/db/explorer";

const RESERVED_EXPORT_PARAMS = new Set(["sort", "dir", "dateColumn", "dateFrom", "dateTo", "limit"]);

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

/**
 * Reads the "how many rows" choice from the export panel (ExportButton),
 * clamped to `maxCap` so a hand-edited URL can't exceed the route's hard
 * cap. Falls back to `maxCap` when absent/invalid, matching the export
 * routes' pre-existing "always export everything up to the cap" default.
 */
export function parseLimitParam(request: NextRequest, maxCap: number): number {
  const raw = Number(request.nextUrl.searchParams.get("limit"));
  if (!Number.isFinite(raw) || raw <= 0) return maxCap;
  return Math.min(Math.floor(raw), maxCap);
}
