"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { StatTile } from "@/components/kpi/StatTile";
import { Spinner } from "@/components/Spinner";
import { formatAsOf } from "@/lib/format";

const RANGES = [1, 7, 15, 30] as const;

// Chat overlaps almost entirely with "Joined a pool" — sending a message is how
// a user joins a pool — so it's not shown as a standalone summary tile. It still
// counts toward "Did any activity" and still appears in the per-user detail.
const HIDDEN_SUMMARY_LABELS = new Set(["Sent a chat message"]);

interface ApiEvent {
  userId: string;
  userName: string | null;
  phone: string | null;
  signedUpAt: string;
  activityType: string;
  occurredAt: string;
  detail: string | null;
}

interface ApiResponse {
  days: number;
  from: string;
  to: string;
  summary: { label: string; value: number }[];
  detail: ApiEvent[];
}

interface UserGroup {
  userId: string;
  userName: string | null;
  phone: string | null;
  signedUpAt: string;
  lastActivityAt: string;
  events: ApiEvent[];
}

export function NewUserActivityView() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/new-user-activity?days=${days}`, { signal: controller.signal })
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
  }, [days]);

  const userGroups = useMemo<UserGroup[]>(() => {
    if (!data) return [];
    const byUser = new Map<string, UserGroup>();
    for (const e of data.detail) {
      let group = byUser.get(e.userId);
      if (!group) {
        group = {
          userId: e.userId,
          userName: e.userName,
          phone: e.phone,
          signedUpAt: e.signedUpAt,
          lastActivityAt: e.occurredAt,
          events: [],
        };
        byUser.set(e.userId, group);
      }
      group.events.push(e);
      if (e.occurredAt > group.lastActivityAt) group.lastActivityAt = e.occurredAt;
    }
    return Array.from(byUser.values()).sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));
  }, [data]);

  function toggleUser(userId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setDays(r)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              days === r
                ? "border-accent bg-accent/10 font-medium text-accent"
                : "border-border text-ink-muted hover:bg-surface-raised"
            }`}
          >
            Last {r} day{r > 1 ? "s" : ""}
          </button>
        ))}
        <a
          href={`/api/new-user-activity/csv?days=${days}`}
          className="ml-auto rounded-lg border border-border px-3 py-1.5 text-sm text-ink hover:bg-surface-raised"
        >
          Export CSV
        </a>
      </div>

      {data && (
        <p className="mb-4 text-[11px] text-ink-muted/70">
          Window: {formatAsOf(data.from)} → {formatAsOf(data.to)}
        </p>
      )}

      {loading && !data && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner className="h-4 w-4" /> Loading…
        </p>
      )}

      {data && (
        <>
          <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {data.summary
              .filter((s) => !HIDDEN_SUMMARY_LABELS.has(s.label))
              .map((s) => (
                <StatTile key={s.label} label={s.label} value={s.value} />
              ))}
          </div>
          <p className="mb-6 text-[11px] text-ink-muted/70">
            Chat isn&rsquo;t shown as its own metric: sending a message is how a user joins a pool, so it overlapped
            almost entirely with &ldquo;Joined a pool.&rdquo; Chat messages still appear per-user in the table below.
          </p>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-raised">
                <tr>
                  <th className="w-8 border-b border-border p-2" />
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">User</th>
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Phone</th>
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Signed up</th>
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                    Activities
                  </th>
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
                          <td className="whitespace-nowrap p-2 text-ink">{formatAsOf(g.signedUpAt)}</td>
                          <td className="whitespace-nowrap p-2 text-ink">{g.events.length}</td>
                          <td className="whitespace-nowrap p-2 text-ink">{formatAsOf(g.lastActivityAt)}</td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-border">
                            <td colSpan={6} className="bg-surface p-0">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr>
                                    <th className="whitespace-nowrap p-2 pl-10 text-left font-medium text-ink-muted">
                                      Activity
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
                      No activity in this window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink-muted/70">
            Showing {userGroups.length.toLocaleString()} users active in this window, most-recently-active first, with
            all of their activity ({data.detail.length.toLocaleString()} events). Click a user to see it. Newest
            activity is only as fresh as the last data import (see &ldquo;Last refreshed&rdquo; top-left).
          </p>
        </>
      )}
    </div>
  );
}
