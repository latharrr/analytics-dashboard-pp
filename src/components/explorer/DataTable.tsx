"use client";

import { useEffect, useMemo, useState } from "react";
import { MODULES } from "@/lib/modules";
import { formatValue, humanizeKey } from "@/lib/format";
import { DATE_TYPES, NUMERIC_TYPES } from "@/lib/columnTypeGroups";
import { Spinner } from "@/components/Spinner";
import { ExportButton } from "@/components/ExportButton";

const PAGE_SIZE = 50;
const EXPORT_ROW_CAP = 10_000;

interface ApiResponse {
  rows: Record<string, unknown>[];
  count: number;
  columns: string[];
  columnTypes: Record<string, string>;
  error?: string;
}

function sortDirLabels(columnType: string | undefined): { asc: string; desc: string } {
  if (columnType && NUMERIC_TYPES.has(columnType)) return { asc: "Low to High", desc: "High to Low" };
  if (columnType && DATE_TYPES.has(columnType)) return { asc: "Oldest to Recent", desc: "Recent to Oldest" };
  return { asc: "A to Z", desc: "Z to A" };
}

export function DataTable() {
  const [table, setTable] = useState(MODULES[0].tables[0]);
  const [page, setPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [dateColumn, setDateColumn] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
    setSortColumn(undefined);
    setFilters({});
    setDateColumn("");
    setDateFrom("");
    setDateTo("");
  }, [table]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (sortColumn) {
      params.set("sort", sortColumn);
      params.set("dir", sortDir);
    }
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    if (dateColumn && (dateFrom || dateTo)) {
      params.set("dateColumn", dateColumn);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    }

    fetch(`/api/explorer/${table}?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json: ApiResponse) => {
        if (json.error) {
          setError(json.error);
          setData(null);
        } else {
          setData(json);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(String(err));
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [table, page, sortColumn, sortDir, filters, dateColumn, dateFrom, dateTo]);

  const exportParams = useMemo(() => {
    const params = new URLSearchParams();
    if (sortColumn) {
      params.set("sort", sortColumn);
      params.set("dir", sortDir);
    }
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    if (dateColumn && (dateFrom || dateTo)) {
      params.set("dateColumn", dateColumn);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    }
    return params.toString();
  }, [sortColumn, sortDir, filters, dateColumn, dateFrom, dateTo]);

  function toggleSort(column: string) {
    if (sortColumn === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDir("asc");
    }
  }

  const dateColumns = useMemo(
    () => Object.entries(data?.columnTypes ?? {}).filter(([, type]) => DATE_TYPES.has(type)).map(([name]) => name),
    [data?.columnTypes]
  );

  const currentSortLabels = sortDirLabels(sortColumn ? data?.columnTypes[sortColumn] : undefined);
  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          value={table}
          onChange={(e) => setTable(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink"
        >
          {MODULES.map((m) => (
            <optgroup key={m.key} label={m.label}>
              {m.tables.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {data && <span className="text-sm text-ink-muted">{data.count.toLocaleString()} rows</span>}

        <ExportButton
          label={table}
          csvHref={`/api/explorer/${table}/csv`}
          xlsxHref={`/api/explorer/${table}/xlsx`}
          params={exportParams}
          maxRows={EXPORT_ROW_CAP}
          className="ml-auto"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-surface-raised p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Sort by</label>
          <div className="flex gap-2">
            <select
              value={sortColumn ?? ""}
              onChange={(e) => setSortColumn(e.target.value || undefined)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
            >
              <option value="">None</option>
              {data?.columns.map((c) => (
                <option key={c} value={c}>
                  {humanizeKey(c)}
                </option>
              ))}
            </select>
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
              disabled={!sortColumn}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink disabled:opacity-40"
            >
              <option value="asc">{currentSortLabels.asc}</option>
              <option value="desc">{currentSortLabels.desc}</option>
            </select>
          </div>
        </div>

        {dateColumns.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Filter by date</label>
            <div className="flex flex-wrap gap-2">
              <select
                value={dateColumn}
                onChange={(e) => setDateColumn(e.target.value)}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
              >
                <option value="">Column…</option>
                {dateColumns.map((c) => (
                  <option key={c} value={c}>
                    {humanizeKey(c)}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                disabled={!dateColumn}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink disabled:opacity-40"
              />
              <span className="self-center text-xs text-ink-muted">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                disabled={!dateColumn}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink disabled:opacity-40"
              />
              {(dateColumn || dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setDateColumn("");
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className="rounded-lg border border-border px-2 py-1 text-xs text-ink-muted hover:bg-surface"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised">
            <tr>
              {data?.columns.map((col) => (
                <th key={col} className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                  <button onClick={() => toggleSort(col)} className="flex items-center gap-1">
                    {humanizeKey(col)}
                    {sortColumn === col && <span>{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </button>
                  <input
                    value={filters[col] ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, [col]: e.target.value }))}
                    placeholder="filter…"
                    className="mt-1 w-full rounded border border-border bg-surface px-1.5 py-0.5 text-xs font-normal text-ink"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={data?.columns.length ?? 1} className="p-4 text-center text-ink-muted">
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="h-4 w-4" />
                    Loading…
                  </span>
                </td>
              </tr>
            )}
            {!loading &&
              data?.rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {data.columns.map((col) => (
                    <td key={col} className="whitespace-nowrap p-2 text-ink">
                      {formatValue(row[col])}
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && data?.rows.length === 0 && (
              <tr>
                <td colSpan={data.columns.length || 1} className="p-4 text-center text-ink-muted">
                  No rows match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3 text-sm text-ink-muted">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded border border-border px-2 py-1 disabled:opacity-40"
        >
          Prev
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          className="rounded border border-border px-2 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
