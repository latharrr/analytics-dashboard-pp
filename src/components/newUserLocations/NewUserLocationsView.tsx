"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChartCard, type BarDatum } from "@/components/kpi/BarChartCard";
import { Spinner } from "@/components/Spinner";
import { ExportButton } from "@/components/ExportButton";
import { formatAsOf } from "@/lib/format";

// Kept in sync with NO_LOCATION_LABEL / UNRESOLVED_LOCATION_LABEL in
// src/lib/db/newUserLocations.ts (can't import that server module into a client component).
const NO_LOCATION_LABEL = "No location captured";
const UNRESOLVED_LOCATION_LABEL = "Unknown location";

const RANGES = [1, 7, 15, 30] as const;
const EXPORT_ROW_CAP = 5_000;

interface ApiUser {
  userId: string;
  userName: string | null;
  phone: string | null;
  locationLabel: string;
  signedUpAt: string;
}

interface ApiResponse {
  allUsers: boolean;
  days: number;
  from: string | null;
  to: string | null;
  summary: BarDatum[];
  users: ApiUser[];
  totalCount: number;
}

type SortColumn = "userName" | "locationLabel" | "signedUpAt";
type Scope = (typeof RANGES)[number] | "all";

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "userName", label: "Name" },
  { key: "locationLabel", label: "Location" },
  { key: "signedUpAt", label: "Signed up" },
];

export function NewUserLocationsView() {
  const [scope, setScope] = useState<Scope>(7);
  const [sortColumn, setSortColumn] = useState<SortColumn>("signedUpAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const query = scope === "all" ? "scope=all" : `days=${scope}`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/new-user-locations?${query}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json: ApiResponse) => setData(json))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

  const coverage = useMemo(() => {
    if (!data) return null;
    const shown = data.users.length;
    const noLocation = data.users.filter((u) => u.locationLabel === NO_LOCATION_LABEL).length;
    const unresolved = data.users.filter((u) => u.locationLabel === UNRESOLVED_LOCATION_LABEL).length;
    return { shown, noLocation, unresolved, resolved: shown - noLocation - unresolved };
  }, [data]);

  const sortedUsers = useMemo(() => {
    if (!data) return [];
    const rows = [...data.users];
    rows.sort((a, b) => {
      const av = a[sortColumn];
      const bv = b[sortColumn];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data, sortColumn, sortDir]);

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDir(column === "signedUpAt" ? "desc" : "asc");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setScope(r)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              scope === r
                ? "border-accent bg-accent/10 font-medium text-accent"
                : "border-border text-ink-muted hover:bg-surface-raised"
            }`}
          >
            Last {r} day{r > 1 ? "s" : ""}
          </button>
        ))}
        <button
          onClick={() => setScope("all")}
          className={`rounded-lg border px-3 py-1.5 text-sm ${
            scope === "all"
              ? "border-accent bg-accent/10 font-medium text-accent"
              : "border-border text-ink-muted hover:bg-surface-raised"
          }`}
        >
          All users
        </button>
        {data && (
          <span className="ml-2 text-sm text-ink-muted">
            {data.totalCount.toLocaleString()} {data.allUsers ? "users" : "new users"}
          </span>
        )}
        <ExportButton
          label="new user locations"
          csvHref="/api/new-user-locations/csv"
          xlsxHref="/api/new-user-locations/xlsx"
          params={query}
          maxRows={EXPORT_ROW_CAP}
          className="ml-auto"
        />
      </div>

      {data && data.from && data.to && (
        <p className="mb-4 text-[11px] text-ink-muted/70">
          Window: {formatAsOf(data.from)} → {formatAsOf(data.to)}
        </p>
      )}

      {coverage && coverage.shown > 0 && (
        <p className="mb-4 text-[11px] text-ink-muted/70">
          Of the {coverage.shown.toLocaleString()} shown:{" "}
          <span className="text-ink">{coverage.resolved.toLocaleString()}</span> have a city,{" "}
          <span className="text-ink">{coverage.noLocation.toLocaleString()}</span> shared no location at signup
          {coverage.unresolved > 0 && (
            <>
              , <span className="text-ink">{coverage.unresolved.toLocaleString()}</span> not resolved yet
            </>
          )}
          . Blank locations are missing source data (the app didn&rsquo;t capture a coordinate), not a lookup error.
        </p>
      )}

      {loading && !data && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner className="h-4 w-4" /> Loading…
        </p>
      )}

      {data && (
        <>
          <div className="mb-6">
            <BarChartCard title="New users by location" data={data.summary} valueLabel="new users" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-raised">
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink"
                    >
                      <button onClick={() => toggleSort(col.key)} className="flex items-center gap-1">
                        {col.label}
                        {sortColumn === col.key && <span>{sortDir === "asc" ? "↑" : "↓"}</span>}
                      </button>
                    </th>
                  ))}
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Phone</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((u) => (
                  <tr key={u.userId} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap p-2 text-ink">{u.userName ?? "—"}</td>
                    <td className="whitespace-nowrap p-2 text-ink">{u.locationLabel}</td>
                    <td className="whitespace-nowrap p-2 text-ink">{formatAsOf(u.signedUpAt)}</td>
                    <td className="whitespace-nowrap p-2 text-ink">{u.phone ?? "—"}</td>
                  </tr>
                ))}
                {sortedUsers.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} className="p-4 text-center text-ink-muted">
                      No new users in this window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink-muted/70">
            Showing the {data.users.length.toLocaleString()} most recent signups (capped at 500 on-page; export
            includes up to {EXPORT_ROW_CAP.toLocaleString()}). Click a column to sort.
          </p>
        </>
      )}
    </div>
  );
}
