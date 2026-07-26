"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/format";
import { Spinner } from "@/components/Spinner";

interface CategoryRow {
  category: string;
  users: number;
  tags: number;
  views: number;
  joins: number;
  likes: number;
  dwellMs: number;
  viewsPerUser: number | null;
  lastSignalAt: string | null;
  topTags: string | null;
}

type SortKey = "views" | "users" | "joins" | "dwellMs" | "viewsPerUser";

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "users", label: "Users", title: "Distinct non-bot users with any recorded signal in this category" },
  { key: "views", label: "Views", title: "Total view_count across every tag in this category" },
  { key: "joins", label: "Joins", title: "Total join_count — pools joined off the back of this category" },
  { key: "dwellMs", label: "Dwell", title: "Total time-on-content recorded for this category" },
  { key: "viewsPerUser", label: "Views / user", title: "Views ÷ users who engaged with this category (not ÷ all users)" },
];

function formatDwell(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours >= 1) return `${hours.toFixed(hours >= 10 ? 0 : 1)} h`;
  return `${Math.round(ms / 60_000)} min`;
}

export function CategoryIntentView() {
  const [rows, setRows] = useState<CategoryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("views");

  useEffect(() => {
    fetch("/api/category-intent")
      .then((res) => res.json())
      .then((json: { categories: CategoryRow[] }) => setRows(json.categories ?? []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0));
  }, [rows, sortKey]);

  const totals = useMemo(() => {
    if (!rows) return null;
    return {
      views: rows.reduce((n, r) => n + r.views, 0),
      joins: rows.reduce((n, r) => n + r.joins, 0),
      dwellMs: rows.reduce((n, r) => n + r.dwellMs, 0),
      categories: rows.length,
    };
  }, [rows]);

  const maxViews = sorted.length ? Math.max(...sorted.map((r) => r.views)) : 0;

  return (
    <div>
      {totals && (
        <div className="mb-4 flex flex-wrap gap-3">
          {[
            { label: "Categories", value: totals.categories.toLocaleString() },
            { label: "Total views", value: totals.views.toLocaleString() },
            { label: "Total joins", value: totals.joins.toLocaleString() },
            { label: "Total dwell", value: formatDwell(totals.dwellMs) },
          ].map((t) => (
            <div key={t.label} className="rounded-xl border border-border bg-surface-raised px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-ink-muted/70">{t.label}</p>
              <p className="text-lg font-semibold text-ink">{t.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-ink-muted">Sort by</span>
        {COLUMNS.map((c) => (
          <button
            key={c.key}
            onClick={() => setSortKey(c.key)}
            className={`rounded-lg border px-2 py-1 text-xs ${
              sortKey === c.key
                ? "border-border bg-surface-raised font-medium text-ink"
                : "border-border text-ink-muted hover:bg-surface"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised">
            <tr>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Category</th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  title={c.title}
                  className="whitespace-nowrap border-b border-border p-2 text-right font-medium text-ink"
                >
                  {c.label}
                </th>
              ))}
              <th
                className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink"
                title="The three most-viewed tags inside this category"
              >
                Top tags
              </th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                Last signal
              </th>
              <th className="border-b border-border p-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-ink-muted">
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="h-4 w-4" /> Loading…
                  </span>
                </td>
              </tr>
            )}
            {!loading &&
              sorted.map((r) => (
                <tr key={r.category} className="border-b border-border last:border-0 hover:bg-surface-raised">
                  <td className="whitespace-nowrap p-2 font-medium text-ink">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-1.5 rounded-full bg-ink/20"
                        style={{ width: `${maxViews ? Math.max(4, (r.views / maxViews) * 64) : 4}px` }}
                        aria-hidden
                      />
                      {r.category}
                    </div>
                  </td>
                  <td className="whitespace-nowrap p-2 text-right text-ink">{r.users.toLocaleString()}</td>
                  <td className="whitespace-nowrap p-2 text-right text-ink">{r.views.toLocaleString()}</td>
                  <td className="whitespace-nowrap p-2 text-right text-ink">{r.joins.toLocaleString()}</td>
                  <td className="whitespace-nowrap p-2 text-right text-ink">{formatDwell(r.dwellMs)}</td>
                  <td className="whitespace-nowrap p-2 text-right text-ink">
                    {r.viewsPerUser != null ? r.viewsPerUser.toLocaleString() : "—"}
                  </td>
                  <td className="p-2 text-ink-muted">{r.topTags ?? "—"}</td>
                  <td
                    className="whitespace-nowrap p-2 text-ink-muted"
                    title={r.lastSignalAt ?? ""}
                  >
                    {formatRelativeTime(r.lastSignalAt)}
                  </td>
                  <td className="whitespace-nowrap p-2 text-right">
                    <Link
                      href={`/all-users?category=${encodeURIComponent(r.category)}`}
                      className="rounded-lg border border-border px-2 py-1 text-xs text-ink-muted hover:bg-surface"
                    >
                      View users →
                    </Link>
                  </td>
                </tr>
              ))}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-ink-muted">
                  No category signal recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-ink-muted/70">
        Source is per-user, per-tag affinity (<b>view</b>, <b>join</b>, <b>like</b> and <b>dwell</b> counters written
        by the app), rolled up to each tag&rsquo;s category. Bot accounts excluded.{" "}
        <b>A user who engages with several categories is counted in each one</b>, so Users does not sum to the user
        base — this asks &ldquo;how many people look at this category&rdquo;, not how the user base splits. That also
        makes these counts larger than the per-category counts on All Users, which use only each user&rsquo;s single
        top category. Two counters the app never populates (<code>chat_msg_count</code>, <code>dismiss_count</code>)
        are deliberately not shown. Refreshed nightly.
      </p>
    </div>
  );
}
