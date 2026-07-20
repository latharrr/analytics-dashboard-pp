"use client";

import { useEffect, useMemo, useState } from "react";
import { formatAsOf, formatRelativeTime } from "@/lib/format";
import { Spinner } from "@/components/Spinner";

interface ApiUser {
  userId: string;
  userName: string | null;
  phone: string | null;
  collegeName: string | null;
  trustScore: number | null;
  signedUpAt: string;
  lastActivity: string | null;
  digilockerVerifiedAt: string | null;
  collegeVerifiedAt: string | null;
}

interface ApiResponse {
  users: ApiUser[];
  totalCount: number;
}

type SortColumn = "userName" | "collegeName" | "trustScore" | "signedUpAt" | "lastActivity";

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "userName", label: "Name" },
  { key: "collegeName", label: "College" },
  { key: "trustScore", label: "Trust Score" },
  { key: "signedUpAt", label: "Signed up" },
  { key: "lastActivity", label: "Last active" },
];

export function VerifiedUsersView() {
  const [search, setSearch] = useState("");
  const [college, setCollege] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("signedUpAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (college.trim()) params.set("college", college.trim());
    if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
    if (dateTo) params.set("to", new Date(dateTo).toISOString());

    const timeout = setTimeout(() => {
      fetch(`/api/verified-users?${params.toString()}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((json: ApiResponse) => setData(json))
        .catch((err) => {
          if (err.name !== "AbortError") console.error(err);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [search, college, dateFrom, dateTo]);

  const exportParams = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (college.trim()) params.set("college", college.trim());
    if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
    if (dateTo) params.set("to", new Date(dateTo).toISOString());
    return params.toString();
  }, [search, college, dateFrom, dateTo]);

  const sortedUsers = useMemo(() => {
    if (!data) return [];
    const rows = [...data.users];
    rows.sort((a, b) => {
      const av = a[sortColumn];
      const bv = b[sortColumn];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
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
      setSortDir("asc");
    }
  }

  const hasFilters = search || college || dateFrom || dateTo;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-raised p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Search (name / phone)</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. Rohan or 98765…"
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">College</label>
          <input
            type="text"
            value={college}
            onChange={(e) => setCollege(e.target.value)}
            placeholder="e.g. IIT Delhi"
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Signed up from</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Signed up to</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          />
        </div>
        {hasFilters && (
          <button
            onClick={() => {
              setSearch("");
              setCollege("");
              setDateFrom("");
              setDateTo("");
            }}
            className="rounded-lg border border-border px-2 py-1.5 text-xs text-ink-muted hover:bg-surface"
          >
            Clear
          </button>
        )}
        {data && (
          <span className="text-sm text-ink-muted">{data.totalCount.toLocaleString()} verified users</span>
        )}
        <a
          href={`/api/verified-users/csv?${exportParams}`}
          className="ml-auto rounded-lg border border-border px-3 py-1.5 text-sm text-ink hover:bg-surface-raised"
        >
          Export CSV
        </a>
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
            {loading && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="p-4 text-center text-ink-muted">
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="h-4 w-4" /> Loading…
                  </span>
                </td>
              </tr>
            )}
            {!loading &&
              sortedUsers.map((u) => (
                <tr key={u.userId} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap p-2 text-ink">{u.userName ?? "—"}</td>
                  <td className="whitespace-nowrap p-2 text-ink">{u.collegeName ?? "—"}</td>
                  <td className="whitespace-nowrap p-2 text-ink">{u.trustScore ?? "—"}</td>
                  <td className="whitespace-nowrap p-2 text-ink" title={formatAsOf(u.signedUpAt)}>
                    {formatRelativeTime(u.signedUpAt)}
                  </td>
                  <td className="whitespace-nowrap p-2 text-ink">{formatRelativeTime(u.lastActivity)}</td>
                  <td className="whitespace-nowrap p-2 text-ink">{u.phone ?? "—"}</td>
                </tr>
              ))}
            {!loading && sortedUsers.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="p-4 text-center text-ink-muted">
                  No verified users match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-ink-muted/70">
        Showing up to {sortedUsers.length.toLocaleString()} users on-page; CSV export includes up to 5,000 matching
        the current filters.
      </p>
    </div>
  );
}
