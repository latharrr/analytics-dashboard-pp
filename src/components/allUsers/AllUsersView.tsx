"use client";

import { useEffect, useMemo, useState } from "react";
import { formatAsOf, formatRelativeTime } from "@/lib/format";
import { Spinner } from "@/components/Spinner";

type SortBy = "last_active" | "signed_up" | "name" | "trust_score";
type SortDir = "asc" | "desc";

interface ApiUser {
  userId: string;
  userName: string | null;
  phone: string | null;
  signedUpAt: string;
  lastActiveAt: string | null;
  trustScore: number | null;
  isVerified: boolean;
  isBanned: boolean;
  lastActivityType: string | null;
  lastActivityDetail: string | null;
  lastActivityOccurredAt: string | null;
}

interface ApiResponse {
  users: ApiUser[];
  totalCount: number;
  page: number;
  pageSize: number;
}

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "last_active", label: "Last active" },
  { value: "signed_up", label: "Signed up (installed)" },
  { value: "name", label: "Name" },
  { value: "trust_score", label: "Trust score" },
];

export function AllUsersView() {
  const [search, setSearch] = useState("");
  const [signedUpFrom, setSignedUpFrom] = useState("");
  const [signedUpTo, setSignedUpTo] = useState("");
  const [lastActiveFrom, setLastActiveFrom] = useState("");
  const [lastActiveTo, setLastActiveTo] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("last_active");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [search, signedUpFrom, signedUpTo, lastActiveFrom, lastActiveTo, sortBy, sortDir]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    if (search.trim()) params.set("search", search.trim());
    if (signedUpFrom) params.set("signedUpFrom", new Date(signedUpFrom).toISOString());
    if (signedUpTo) params.set("signedUpTo", new Date(signedUpTo).toISOString());
    if (lastActiveFrom) params.set("lastActiveFrom", new Date(lastActiveFrom).toISOString());
    if (lastActiveTo) params.set("lastActiveTo", new Date(lastActiveTo).toISOString());

    const timeout = setTimeout(() => {
      fetch(`/api/all-users?${params.toString()}`, { signal: controller.signal })
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
  }, [search, signedUpFrom, signedUpTo, lastActiveFrom, lastActiveTo, sortBy, sortDir, page]);

  const exportParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    if (search.trim()) params.set("search", search.trim());
    if (signedUpFrom) params.set("signedUpFrom", new Date(signedUpFrom).toISOString());
    if (signedUpTo) params.set("signedUpTo", new Date(signedUpTo).toISOString());
    if (lastActiveFrom) params.set("lastActiveFrom", new Date(lastActiveFrom).toISOString());
    if (lastActiveTo) params.set("lastActiveTo", new Date(lastActiveTo).toISOString());
    return params.toString();
  }, [search, signedUpFrom, signedUpTo, lastActiveFrom, lastActiveTo, sortBy, sortDir]);

  const hasFilters = search || signedUpFrom || signedUpTo || lastActiveFrom || lastActiveTo;
  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;

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
          <label className="mb-1 block text-xs font-medium text-ink-muted">Signed up from</label>
          <input
            type="date"
            value={signedUpFrom}
            onChange={(e) => setSignedUpFrom(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Signed up to</label>
          <input
            type="date"
            value={signedUpTo}
            onChange={(e) => setSignedUpTo(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Last active from</label>
          <input
            type="date"
            value={lastActiveFrom}
            onChange={(e) => setLastActiveFrom(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Last active to</label>
          <input
            type="date"
            value={lastActiveTo}
            onChange={(e) => setLastActiveTo(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Sort by</label>
          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as SortDir)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
            >
              <option value="desc">Newest / high first</option>
              <option value="asc">Oldest / low first</option>
            </select>
          </div>
        </div>
        {hasFilters && (
          <button
            onClick={() => {
              setSearch("");
              setSignedUpFrom("");
              setSignedUpTo("");
              setLastActiveFrom("");
              setLastActiveTo("");
            }}
            className="rounded-lg border border-border px-2 py-1.5 text-xs text-ink-muted hover:bg-surface"
          >
            Clear
          </button>
        )}
        {data && <span className="text-sm text-ink-muted">{data.totalCount.toLocaleString()} users</span>}
        <div className="ml-auto flex items-center gap-2">
          <a
            href={`/api/all-users/csv?${exportParams}`}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-ink hover:bg-surface-raised"
          >
            Export CSV
          </a>
          <a
            href={`/api/all-users/xlsx?${exportParams}`}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-ink hover:bg-surface-raised"
          >
            Export Sheet (.xlsx)
          </a>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised">
            <tr>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Name</th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Phone</th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                Signed up (installed)
              </th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                Last active
              </th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                Last activity
              </th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Trust</th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-ink-muted">
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="h-4 w-4" /> Loading…
                  </span>
                </td>
              </tr>
            )}
            {!loading &&
              data?.users.map((u) => (
                <tr key={u.userId} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap p-2 font-medium text-ink">{u.userName ?? u.userId}</td>
                  <td className="whitespace-nowrap p-2 text-ink">{u.phone ?? "—"}</td>
                  <td className="whitespace-nowrap p-2 text-ink" title={formatAsOf(u.signedUpAt)}>
                    {formatRelativeTime(u.signedUpAt)}
                  </td>
                  <td className="whitespace-nowrap p-2 text-ink" title={u.lastActiveAt ? formatAsOf(u.lastActiveAt) : ""}>
                    {formatRelativeTime(u.lastActiveAt)}
                  </td>
                  <td className="p-2 text-ink">
                    {u.lastActivityType ? (
                      <span>
                        {u.lastActivityType}
                        {u.lastActivityDetail ? ` — ${u.lastActivityDetail}` : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap p-2 text-ink">{u.trustScore ?? "—"}</td>
                  <td className="whitespace-nowrap p-2 text-ink">
                    {u.isBanned ? "Banned" : u.isVerified ? "Verified" : "—"}
                  </td>
                </tr>
              ))}
            {!loading && data?.users.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-ink-muted">
                  No users match.
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
      <p className="mt-2 text-[11px] text-ink-muted/70">
        &ldquo;Last activity&rdquo; is each user&rsquo;s single most recent tracked event (chat, trust action, pool
        joined/created, PG search, or Flat/Flatmate listing) — no page-visit or time-on-screen tracking exists in
        this data. CSV/Sheet export includes up to 10,000 users matching the current filters (not just this page).
      </p>
    </div>
  );
}
