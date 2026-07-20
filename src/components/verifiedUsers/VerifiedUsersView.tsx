"use client";

import { useEffect, useMemo, useState } from "react";
import { formatAsOf, formatRelativeTime } from "@/lib/format";
import { Spinner } from "@/components/Spinner";
import { ExportButton } from "@/components/ExportButton";

const EXPORT_ROW_CAP = 5_000;

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

type SortColumn =
  | "userName"
  | "collegeName"
  | "trustScore"
  | "signedUpAt"
  | "lastActivity"
  | "digilockerVerifiedAt"
  | "collegeVerifiedAt";

type VerificationFilter = "both" | "digilocker" | "college" | "either";

const VERIFICATION_OPTIONS: { value: VerificationFilter; label: string }[] = [
  { value: "both", label: "Both Digilocker + College" },
  { value: "either", label: "Either method" },
  { value: "digilocker", label: "Digilocker verified" },
  { value: "college", label: "College verified" },
];

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "userName", label: "Name" },
  { key: "collegeName", label: "College" },
  { key: "trustScore", label: "Trust Score" },
  { key: "signedUpAt", label: "Signed up" },
  { key: "lastActivity", label: "Last active" },
  { key: "digilockerVerifiedAt", label: "Digilocker" },
  { key: "collegeVerifiedAt", label: "College ID" },
];

export function VerifiedUsersView() {
  const [search, setSearch] = useState("");
  const [college, setCollege] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>("both");
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
    params.set("verification", verificationFilter);

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
  }, [search, college, dateFrom, dateTo, verificationFilter]);

  const exportParams = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (college.trim()) params.set("college", college.trim());
    if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
    if (dateTo) params.set("to", new Date(dateTo).toISOString());
    params.set("verification", verificationFilter);
    return params.toString();
  }, [search, college, dateFrom, dateTo, verificationFilter]);

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

  const hasFilters = search || college || dateFrom || dateTo || verificationFilter !== "both";

  function badge(verifiedAt: string | null) {
    return verifiedAt ? (
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <span aria-hidden>✓</span>
        <span title={formatAsOf(verifiedAt)}>{formatRelativeTime(verifiedAt)}</span>
      </span>
    ) : (
      <span className="text-ink-muted">—</span>
    );
  }

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
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Verified via</label>
          <select
            value={verificationFilter}
            onChange={(e) => setVerificationFilter(e.target.value as VerificationFilter)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          >
            {VERIFICATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <button
            onClick={() => {
              setSearch("");
              setCollege("");
              setDateFrom("");
              setDateTo("");
              setVerificationFilter("both");
            }}
            className="rounded-lg border border-border px-2 py-1.5 text-xs text-ink-muted hover:bg-surface"
          >
            Clear
          </button>
        )}
        {data && (
          <span className="text-sm text-ink-muted">{data.totalCount.toLocaleString()} verified users</span>
        )}
        <ExportButton
          label="verified users"
          csvHref="/api/verified-users/csv"
          xlsxHref="/api/verified-users/xlsx"
          params={exportParams}
          maxRows={EXPORT_ROW_CAP}
          className="ml-auto"
        />
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
                  <td className="whitespace-nowrap p-2 text-sm">{badge(u.digilockerVerifiedAt)}</td>
                  <td className="whitespace-nowrap p-2 text-sm">{badge(u.collegeVerifiedAt)}</td>
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
        Showing up to {sortedUsers.length.toLocaleString()} users on-page; CSV/Excel export includes up to{" "}
        {EXPORT_ROW_CAP.toLocaleString()} matching the current filters (pick the row count in the Export panel).
      </p>
    </div>
  );
}
