"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatAsOf, formatRelativeTime } from "@/lib/format";
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

interface PoolCategoryRow {
  categorySlug: string;
  category: string;
  pools: number;
  creators: number;
  joins: number;
  joiners: number;
  isListingOnly: boolean;
  newestPoolAt: string | null;
  newestJoinAt: string | null;
}

interface PoolCategoryUser {
  userId: string;
  userName: string | null;
  phone: string | null;
  poolsCreated: number;
  poolsJoined: number;
  lastActivityAt: string | null;
  trustScore: number | null;
  isVerified: boolean;
}

interface PoolUsersState {
  loading: boolean;
  users: PoolCategoryUser[];
  totalCount: number;
  rowCap: number;
}

type Tab = "pool" | "content";
type SortKey = "views" | "users" | "joins" | "dwellMs" | "viewsPerUser";

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "pool", label: "Pool categories", hint: "What users create and join" },
  { key: "content", label: "Content categories", hint: "What users browse — views, dwell, likes" },
];

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
  const [poolRows, setPoolRows] = useState<PoolCategoryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("pool");
  const [poolPick, setPoolPick] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("views");

  useEffect(() => {
    fetch("/api/category-intent")
      .then((res) => res.json())
      .then((json: { categories: CategoryRow[]; poolCategories: PoolCategoryRow[] }) => {
        setRows(json.categories ?? []);
        setPoolRows(json.poolCategories ?? []);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const visiblePoolRows = useMemo(
    () => (poolRows ?? []).filter((r) => !poolPick || r.categorySlug === poolPick),
    [poolRows, poolPick]
  );

  const poolTotals = useMemo(() => {
    const rs = poolRows ?? [];
    return {
      categories: rs.length,
      pools: rs.reduce((n, r) => n + r.pools, 0),
      joins: rs.reduce((n, r) => n + r.joins, 0),
    };
  }, [poolRows]);

  // Fetched per category on first expand, then kept so re-opening is instant.
  const [poolUsers, setPoolUsers] = useState<Record<string, PoolUsersState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleCategory = useCallback(
    (slug: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(slug)) next.delete(slug);
        else next.add(slug);
        return next;
      });
      setPoolUsers((prev) => {
        if (prev[slug]) return prev;
        fetch(`/api/category-intent/users?category=${encodeURIComponent(slug)}`)
          .then((res) => res.json())
          .then((json: { users: PoolCategoryUser[]; totalCount: number; rowCap: number }) =>
            setPoolUsers((p) => ({
              ...p,
              [slug]: {
                loading: false,
                users: json.users ?? [],
                totalCount: json.totalCount ?? 0,
                rowCap: json.rowCap ?? 500,
              },
            }))
          )
          .catch((err) => {
            console.error(err);
            setPoolUsers((p) => ({ ...p, [slug]: { loading: false, users: [], totalCount: 0, rowCap: 500 } }));
          });
        return { ...prev, [slug]: { loading: true, users: [], totalCount: 0, rowCap: 500 } };
      });
    },
    []
  );

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
      <div className="mb-4 flex w-fit gap-1 rounded-xl border border-border bg-surface-raised p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            title={t.hint}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === t.key ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pool" && (
        <div>
          <div className="mb-4 flex flex-wrap gap-3">
            {[
              { label: "Categories", value: poolTotals.categories.toLocaleString() },
              { label: "Pools created", value: poolTotals.pools.toLocaleString() },
              { label: "Total joins", value: poolTotals.joins.toLocaleString() },
            ].map((t) => (
              <div key={t.label} className="rounded-xl border border-border bg-surface-raised px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-ink-muted/70">{t.label}</p>
                <p className="text-lg font-semibold text-ink">{t.value}</p>
              </div>
            ))}
          </div>

          <div className="mb-3 flex items-center gap-2">
            <label className="text-xs font-medium text-ink-muted">Category</label>
            <select
              value={poolPick}
              onChange={(e) => setPoolPick(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
            >
              <option value="">All Categories</option>
              {(poolRows ?? []).map((r) => (
                <option key={r.categorySlug} value={r.categorySlug}>
                  {r.category}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-raised">
                <tr>
                  <th className="w-8 border-b border-border p-2" />
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                    Category
                  </th>
                  <th
                    className="whitespace-nowrap border-b border-border p-2 text-right font-medium text-ink"
                    title="Pools created in this category"
                  >
                    Pools
                  </th>
                  <th
                    className="whitespace-nowrap border-b border-border p-2 text-right font-medium text-ink"
                    title="Distinct non-bot users who created a pool here"
                  >
                    Creators
                  </th>
                  <th
                    className="whitespace-nowrap border-b border-border p-2 text-right font-medium text-ink"
                    title="Total joins by non-bot users"
                  >
                    Joins
                  </th>
                  <th
                    className="whitespace-nowrap border-b border-border p-2 text-right font-medium text-ink"
                    title="Distinct non-bot users who joined a pool here"
                  >
                    Joiners
                  </th>
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                    Newest pool
                  </th>
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
                  visiblePoolRows.map((r) => {
                    const isOpen = expanded.has(r.categorySlug);
                    const detail = poolUsers[r.categorySlug];
                    return (
                      <Fragment key={r.categorySlug}>
                        <tr
                          onClick={() => toggleCategory(r.categorySlug)}
                          className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-raised"
                          title="Click to see the users behind this category"
                        >
                          <td className="p-2 text-center text-ink-muted">{isOpen ? "▾" : "▸"}</td>
                          <td className="whitespace-nowrap p-2 font-medium text-ink">{r.category}</td>
                          <td className="whitespace-nowrap p-2 text-right text-ink">{r.pools.toLocaleString()}</td>
                          <td className="whitespace-nowrap p-2 text-right text-ink">{r.creators.toLocaleString()}</td>
                          <td
                            className="whitespace-nowrap p-2 text-right text-ink"
                            title={
                              r.isListingOnly
                                ? "Listing-type pools — nobody joins these, so this is not zero interest"
                                : ""
                            }
                          >
                            {r.isListingOnly ? <span className="text-ink-muted">n/a</span> : r.joins.toLocaleString()}
                          </td>
                          <td className="whitespace-nowrap p-2 text-right text-ink">
                            {r.isListingOnly ? (
                              <span className="text-ink-muted">n/a</span>
                            ) : (
                              r.joiners.toLocaleString()
                            )}
                          </td>
                          <td className="whitespace-nowrap p-2 text-ink-muted" title={r.newestPoolAt ?? ""}>
                            {formatRelativeTime(r.newestPoolAt)}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-border last:border-0">
                            <td colSpan={7} className="bg-surface-raised/40 p-3">
                              {detail?.loading && (
                                <span className="inline-flex items-center gap-2 text-ink-muted">
                                  <Spinner className="h-4 w-4" /> Loading users…
                                </span>
                              )}
                              {detail && !detail.loading && detail.users.length === 0 && (
                                <span className="text-ink-muted">No users found for this category.</span>
                              )}
                              {detail && !detail.loading && detail.users.length > 0 && (
                                <div>
                                  <p className="mb-2 text-xs text-ink-muted">
                                    {detail.totalCount.toLocaleString()} user
                                    {detail.totalCount === 1 ? "" : "s"} created or joined a pool in{" "}
                                    <b>{r.category}</b>
                                    {detail.totalCount > detail.users.length
                                      ? ` — showing the top ${detail.users.length.toLocaleString()}`
                                      : ""}
                                    .
                                  </p>
                                  <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                                    <table className="w-full text-xs">
                                      <thead className="bg-surface-raised">
                                        <tr>
                                          <th className="border-b border-border p-2 text-left font-medium text-ink">
                                            Name
                                          </th>
                                          <th className="border-b border-border p-2 text-left font-medium text-ink">
                                            Phone
                                          </th>
                                          <th className="border-b border-border p-2 text-right font-medium text-ink">
                                            Pools created
                                          </th>
                                          <th className="border-b border-border p-2 text-right font-medium text-ink">
                                            Pools joined
                                          </th>
                                          <th className="border-b border-border p-2 text-left font-medium text-ink">
                                            Last active here
                                          </th>
                                          <th className="border-b border-border p-2 text-left font-medium text-ink">
                                            Trust
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {detail.users.map((u) => (
                                          <tr key={u.userId} className="border-b border-border last:border-0">
                                            <td className="whitespace-nowrap p-2 font-medium text-ink">
                                              {u.userName ?? u.userId}
                                              {u.isVerified && <span className="ml-1 text-ink-muted">✓</span>}
                                            </td>
                                            <td className="whitespace-nowrap p-2 text-ink">{u.phone ?? "—"}</td>
                                            <td className="whitespace-nowrap p-2 text-right text-ink">
                                              {u.poolsCreated.toLocaleString()}
                                            </td>
                                            <td className="whitespace-nowrap p-2 text-right text-ink">
                                              {u.poolsJoined.toLocaleString()}
                                            </td>
                                            <td
                                              className="whitespace-nowrap p-2 text-ink-muted"
                                              title={u.lastActivityAt ? formatAsOf(u.lastActivityAt) : ""}
                                            >
                                              {formatRelativeTime(u.lastActivityAt)}
                                            </td>
                                            <td className="whitespace-nowrap p-2 text-ink">{u.trustScore ?? "—"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                {!loading && visiblePoolRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-ink-muted">
                      No pools in this category.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-[11px] text-ink-muted/70">
            <b>Click any category to see the users behind it</b> — who created pools there, who joined, and when they
            were last active in it. The app&rsquo;s pool verticals, from <code>pools.category</code> — what users
            actually create and join, as opposed to Content categories, which is what they browse. Bot accounts
            excluded.{" "}
            <b>Flat, Flatmate and PG show &ldquo;n/a&rdquo; for joins because they are listing-type pools</b> — you post
            one, nobody joins it — so their real signal is pools created and distinct creators, not participation.{" "}
            <b>Ranting</b> is included even though it wasn&rsquo;t requested: it is the largest vertical by pools, and
            omitting it would distort every total here. Refreshed nightly.
          </p>
        </div>
      )}

      {tab === "content" && (
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
      )}
    </div>
  );
}
