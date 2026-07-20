"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { formatAsOf, formatRelativeTime } from "@/lib/format";
import { Spinner } from "@/components/Spinner";
import { StatTile } from "@/components/kpi/StatTile";
import { ExportButton } from "@/components/ExportButton";

const EXPORT_ROW_CAP = 5_000;

interface ApiLead {
  userId: string;
  userName: string | null;
  phone: string | null;
  activityType: string;
  occurredAt: string;
  detail: string | null;
}

interface ApiResponse {
  leads: ApiLead[];
  totalCount: number;
}

interface UserGroup {
  userId: string;
  userName: string | null;
  phone: string | null;
  events: ApiLead[];
  firstActivityAt: string;
  lastActivityAt: string;
}

type SortKey = "recent" | "count" | "name";

export function PgFlatEngagementView() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
    if (dateTo) params.set("to", new Date(dateTo).toISOString());

    fetch(`/api/pg-flat-leads?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json: ApiResponse) => {
        setData(json);
        setExpanded(new Set());
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [dateFrom, dateTo]);

  const userGroups = useMemo<UserGroup[]>(() => {
    if (!data) return [];
    const byUser = new Map<string, UserGroup>();
    for (const e of data.leads) {
      let g = byUser.get(e.userId);
      if (!g) {
        g = {
          userId: e.userId,
          userName: e.userName,
          phone: e.phone,
          events: [],
          firstActivityAt: e.occurredAt,
          lastActivityAt: e.occurredAt,
        };
        byUser.set(e.userId, g);
      }
      g.events.push(e);
      if (e.occurredAt > g.lastActivityAt) g.lastActivityAt = e.occurredAt;
      if (e.occurredAt < g.firstActivityAt) g.firstActivityAt = e.occurredAt;
      byUser.set(e.userId, g);
    }

    let groups = Array.from(byUser.values());
    const q = search.trim().toLowerCase();
    if (q) {
      groups = groups.filter(
        (g) => (g.userName ?? "").toLowerCase().includes(q) || (g.phone ?? "").toLowerCase().includes(q)
      );
    }

    groups.sort((a, b) => {
      if (sortKey === "name") return (a.userName ?? "").localeCompare(b.userName ?? "");
      if (sortKey === "count") return b.events.length - a.events.length;
      return a.lastActivityAt < b.lastActivityAt ? 1 : -1;
    });
    return groups;
  }, [data, search, sortKey]);

  const stats = useMemo(() => {
    if (!data) return null;
    const byType = new Map<string, Set<string>>();
    for (const e of data.leads) {
      if (!byType.has(e.activityType)) byType.set(e.activityType, new Set());
      byType.get(e.activityType)!.add(e.userId);
    }
    return {
      distinctUsers: new Set(data.leads.map((e) => e.userId)).size,
      pgSearch: byType.get("PG search")?.size ?? 0,
      flatListing: byType.get("Flat listing")?.size ?? 0,
      flatmateListing: byType.get("Flatmate listing")?.size ?? 0,
    };
  }, [data]);

  function toggleUser(userId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const exportParams = new URLSearchParams();
  if (dateFrom) exportParams.set("from", new Date(dateFrom).toISOString());
  if (dateTo) exportParams.set("to", new Date(dateTo).toISOString());

  const hasFilters = dateFrom || dateTo || search;

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
          <label className="mb-1 block text-xs font-medium text-ink-muted">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Sort by</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          >
            <option value="recent">Most recent activity</option>
            <option value="count">Most actions</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </div>
        {hasFilters && (
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setSearch("");
            }}
            className="rounded-lg border border-border px-2 py-1.5 text-xs text-ink-muted hover:bg-surface"
          >
            Clear
          </button>
        )}
        <ExportButton
          label="PG / Flat engagement"
          csvHref="/api/pg-flat-leads/csv"
          xlsxHref="/api/pg-flat-leads/xlsx"
          params={exportParams.toString()}
          maxRows={EXPORT_ROW_CAP}
          className="ml-auto"
        />
      </div>

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Users engaged" value={stats.distinctUsers} />
          <StatTile label="PG search" value={stats.pgSearch} />
          <StatTile label="Flat listing" value={stats.flatListing} />
          <StatTile label="Flatmate listing" value={stats.flatmateListing} />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised">
            <tr>
              <th className="w-8 border-b border-border p-2" />
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">User</th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Phone</th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Actions</th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">First seen</th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                Last activity
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-ink-muted">
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="h-4 w-4" /> Loading…
                  </span>
                </td>
              </tr>
            )}
            {!loading &&
              userGroups.map((g) => {
                const isOpen = expanded.has(g.userId);
                return (
                  <Fragment key={g.userId}>
                    <tr
                      onClick={() => toggleUser(g.userId)}
                      className="cursor-pointer border-b border-border hover:bg-surface-raised"
                    >
                      <td className="p-2 text-center text-ink-muted">{isOpen ? "▾" : "▸"}</td>
                      <td className="whitespace-nowrap p-2 font-medium text-ink">{g.userName ?? g.userId}</td>
                      <td className="whitespace-nowrap p-2 text-ink">{g.phone ?? "—"}</td>
                      <td className="whitespace-nowrap p-2 text-ink">{g.events.length}</td>
                      <td className="whitespace-nowrap p-2 text-ink" title={formatAsOf(g.firstActivityAt)}>
                        {formatRelativeTime(g.firstActivityAt)}
                      </td>
                      <td className="whitespace-nowrap p-2 text-ink" title={formatAsOf(g.lastActivityAt)}>
                        {formatRelativeTime(g.lastActivityAt)}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border">
                        <td colSpan={6} className="bg-surface p-0">
                          <table className="w-full text-sm">
                            <thead>
                              <tr>
                                <th className="whitespace-nowrap p-2 pl-10 text-left font-medium text-ink-muted">
                                  Page
                                </th>
                                <th className="whitespace-nowrap p-2 text-left font-medium text-ink-muted">When</th>
                                <th className="whitespace-nowrap p-2 text-left font-medium text-ink-muted">Detail</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.events.map((e, i) => (
                                <tr key={i} className="border-t border-border/60">
                                  <td className="whitespace-nowrap p-2 pl-10 text-ink">{e.activityType}</td>
                                  <td className="whitespace-nowrap p-2 text-ink">{formatAsOf(e.occurredAt)}</td>
                                  <td className="p-2 text-ink">{e.detail ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            {!loading && userGroups.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-ink-muted">
                  No matching users.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-ink-muted/70">
        Showing {userGroups.length.toLocaleString()} users ({(data?.leads.length ?? 0).toLocaleString()} actions,
        capped at 1,000). No page-visit or time-spent tracking exists anywhere in this data — &ldquo;actions&rdquo;
        are real PG searches submitted, Flat listings created, and Flatmate listings created (same source as PG /
        Flat Leads). Export reflects the date filter only, not the name/phone search.
      </p>
    </div>
  );
}
