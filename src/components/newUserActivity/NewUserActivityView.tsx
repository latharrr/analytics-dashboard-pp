"use client";

import { Fragment, useEffect, useState } from "react";
import { StatTile } from "@/components/kpi/StatTile";
import { Spinner } from "@/components/Spinner";
import { ExportButton } from "@/components/ExportButton";
import { formatAsOf } from "@/lib/format";
import { UserActivityDetail } from "@/components/common/UserActivityDetail";
import { AllUsersView } from "@/components/allUsers/AllUsersView";

const RANGES = [1, 7, 15, 30] as const;
const EXPORT_ROW_CAP = 5_000;
type ActivityFilter = "all" | "active" | "inactive";
type Scope = "new" | "all";

// Chat overlaps almost entirely with "Joined a pool" — sending a message is how
// a user joins a pool — so it's not shown as a standalone summary tile. It still
// counts toward "Did any activity" and still appears in the per-user detail.
const HIDDEN_SUMMARY_LABELS = new Set(["Sent a chat message"]);

interface ApiEvent {
  activityType: string;
  occurredAt: string;
  detail: string | null;
}

interface ApiUser {
  userId: string;
  userName: string | null;
  phone: string | null;
  signedUpAt: string;
  lastActivityAt: string | null;
  activityCount: number;
  events: ApiEvent[];
}

interface ApiResponse {
  days: number;
  activityFilter: ActivityFilter;
  from: string;
  to: string;
  summary: { label: string; value: number }[];
  users: ApiUser[];
}

const FILTER_OPTIONS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive (no activity)" },
];

export function NewUserActivityView() {
  const [scope, setScope] = useState<Scope>("new");
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (scope !== "new") return;
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/new-user-activity?days=${days}&activityFilter=${activityFilter}`, { signal: controller.signal })
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
  }, [scope, days, activityFilter]);

  function toggleUser(userId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const cohortCount = data?.summary.find((s) => s.label === "New users (cohort)")?.value ?? 0;
  const didAnyCount = data?.summary.find((s) => s.label === "Did any activity")?.value ?? 0;
  const inactiveCount = Math.max(cohortCount - didAnyCount, 0);

  return (
    <div>
      <div className="mb-4 inline-flex rounded-lg border border-border p-0.5 text-sm">
        {(
          [
            { value: "new", label: "New signups" },
            { value: "all", label: "All users" },
          ] as const
        ).map((s) => (
          <button
            key={s.value}
            onClick={() => setScope(s.value)}
            className={`rounded-md px-3 py-1.5 ${
              scope === s.value ? "bg-accent/10 font-medium text-accent" : "text-ink-muted hover:bg-surface-raised"
            }`}
          >
            {s.label}
          </button>
        ))}
        {scope === "new" && (
          <ExportButton
            label="new user activity"
            csvHref="/api/new-user-activity/csv"
            xlsxHref="/api/new-user-activity/xlsx"
            params={`days=${days}&activityFilter=${activityFilter}`}
            maxRows={EXPORT_ROW_CAP}
            className="ml-auto"
          />
        )}
      </div>

      {scope === "all" ? (
        <>
          <p className="mb-4 text-[11px] text-ink-muted/70">
            Every user in the app (not just recent signups), with the same expandable activity timeline. Use the
            Activity filter to isolate users who have never done anything.
          </p>
          <AllUsersView />
        </>
      ) : (
        <>
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
            <div className="ml-2 inline-flex rounded-lg border border-border p-0.5">
              {FILTER_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setActivityFilter(f.value)}
                  className={`rounded-md px-2.5 py-1 text-sm ${
                    activityFilter === f.value
                      ? "bg-accent/10 font-medium text-accent"
                      : "text-ink-muted hover:bg-surface-raised"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <a
              href={`/api/new-user-activity/csv?days=${days}&activityFilter=${activityFilter}`}
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
                <StatTile label="Inactive (no activity)" value={inactiveCount} />
              </div>
              <p className="mb-6 text-[11px] text-ink-muted/70">
                &ldquo;New users (cohort)&rdquo; is everyone who signed up in this rolling window; &ldquo;Did any
                activity&rdquo; and &ldquo;Inactive&rdquo; split that cohort. The table lists every cohort user —
                including the inactive ones (activity count 0) that used to be hidden. Use the Active / Inactive filter
                to narrow it. Chat isn&rsquo;t shown as its own tile: sending a message is how a user joins a pool, so
                it overlapped almost entirely with &ldquo;Joined a pool.&rdquo;
              </p>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-raised">
                    <tr>
                      <th className="w-8 border-b border-border p-2" />
                      <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                        User
                      </th>
                      <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                        Phone
                      </th>
                      <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                        Signed up
                      </th>
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
                      data.users.map((u) => {
                        const isOpen = expanded.has(u.userId);
                        const hasEvents = u.activityCount > 0;
                        return (
                          <Fragment key={u.userId}>
                            <tr
                              onClick={() => hasEvents && toggleUser(u.userId)}
                              className={`border-b border-border ${
                                hasEvents ? "cursor-pointer hover:bg-surface-raised" : "text-ink-muted"
                              }`}
                            >
                              <td className="p-2 text-center text-ink-muted">
                                {hasEvents ? (isOpen ? "▾" : "▸") : ""}
                              </td>
                              <td className="whitespace-nowrap p-2 font-medium text-ink">
                                {u.userName ?? u.userId}
                              </td>
                              <td className="whitespace-nowrap p-2 text-ink">{u.phone ?? "—"}</td>
                              <td className="whitespace-nowrap p-2 text-ink">{formatAsOf(u.signedUpAt)}</td>
                              <td className="whitespace-nowrap p-2 text-ink">{u.activityCount}</td>
                              <td className="whitespace-nowrap p-2 text-ink">
                                {u.lastActivityAt ? formatAsOf(u.lastActivityAt) : "—"}
                              </td>
                            </tr>
                            {isOpen && hasEvents && (
                              <UserActivityDetail userId={u.userId} events={u.events} colSpan={6} />
                            )}
                          </Fragment>
                        );
                      })}
                    {!loading && data.users.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-ink-muted">
                          No users match this filter in this window.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-ink-muted/70">
                Showing {data.users.length.toLocaleString()} users (up to 500, active first). Inactive users have no
                expandable activity. Newest activity is only as fresh as the last data import (see &ldquo;Last
                refreshed&rdquo; top-left).
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
