"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatAsOf, formatRelativeTime } from "@/lib/format";
import { Spinner } from "@/components/Spinner";
import { ExportButton } from "@/components/ExportButton";
import { UserActivityDetail } from "@/components/common/UserActivityDetail";

const EXPORT_ROW_CAP = 10_000;

type SortBy =
  | "last_active"
  | "signed_up"
  | "name"
  | "trust_score"
  | "activities"
  | "engagement_density"
  | "retention_score"
  | "category_views";
type SortDir = "asc" | "desc";
type ActivityFilter = "all" | "active" | "inactive";

interface ApiUser {
  userId: string;
  userName: string | null;
  phone: string | null;
  signedUpAt: string;
  lastActiveAt: string | null;
  trustScore: number | null;
  isVerified: boolean;
  isBanned: boolean;
  totalActivities: number;
  activeDays: number;
  daysSinceSignup: number;
  engagementDensity: number | null;
  retentionScore: number | null;
  lastActivityType: string | null;
  lastActivityDetail: string | null;
  lastActivityOccurredAt: string | null;
  topCategory: string | null;
  topCategoryViews: number | null;
  topCategoryDwellMs: number | null;
  categoryCount: number;
}

interface ApiResponse {
  users: ApiUser[];
  totalCount: number;
  page: number;
  pageSize: number;
}

interface CategoryOption {
  category: string;
  userCount: number;
  totalViews: number;
}

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "last_active", label: "Last active" },
  { value: "signed_up", label: "Signed up (installed)" },
  { value: "name", label: "Name" },
  { value: "trust_score", label: "Trust score" },
  { value: "activities", label: "No. of activities" },
  { value: "engagement_density", label: "Engagement density" },
  { value: "retention_score", label: "Retention score" },
  { value: "category_views", label: "Top-category views" },
];

const ACTIVITY_OPTIONS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All users" },
  { value: "active", label: "Active (ever)" },
  { value: "inactive", label: "Inactive (never active)" },
];

export function AllUsersView() {
  // Category Intent links here as /all-users?category=<label> to drill into the
  // users behind a category, so seed the filter from the URL on first render.
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [signedUpFrom, setSignedUpFrom] = useState("");
  const [signedUpTo, setSignedUpTo] = useState("");
  const [lastActiveFrom, setLastActiveFrom] = useState("");
  const [lastActiveTo, setLastActiveTo] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get("category") ?? "");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>("last_active");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Category list is static between nightly refreshes, so fetch it once.
  useEffect(() => {
    fetch("/api/all-users/categories")
      .then((res) => res.json())
      .then((json: { categories: CategoryOption[] }) => setCategories(json.categories ?? []))
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, signedUpFrom, signedUpTo, lastActiveFrom, lastActiveTo, activityFilter, categoryFilter, sortBy, sortDir]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    params.set("activityFilter", activityFilter);
    if (categoryFilter) params.set("categoryFilter", categoryFilter);
    if (search.trim()) params.set("search", search.trim());
    if (signedUpFrom) params.set("signedUpFrom", new Date(signedUpFrom).toISOString());
    if (signedUpTo) params.set("signedUpTo", new Date(signedUpTo).toISOString());
    if (lastActiveFrom) params.set("lastActiveFrom", new Date(lastActiveFrom).toISOString());
    if (lastActiveTo) params.set("lastActiveTo", new Date(lastActiveTo).toISOString());

    const timeout = setTimeout(() => {
      fetch(`/api/all-users?${params.toString()}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((json: ApiResponse) => {
          setData(json);
          setExpanded(new Set());
        })
        .catch((err) => {
          if (err.name !== "AbortError") console.error(err);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    search,
    signedUpFrom,
    signedUpTo,
    lastActiveFrom,
    lastActiveTo,
    activityFilter,
    categoryFilter,
    sortBy,
    sortDir,
    page,
  ]);

  const exportParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    params.set("activityFilter", activityFilter);
    if (categoryFilter) params.set("categoryFilter", categoryFilter);
    if (search.trim()) params.set("search", search.trim());
    if (signedUpFrom) params.set("signedUpFrom", new Date(signedUpFrom).toISOString());
    if (signedUpTo) params.set("signedUpTo", new Date(signedUpTo).toISOString());
    if (lastActiveFrom) params.set("lastActiveFrom", new Date(lastActiveFrom).toISOString());
    if (lastActiveTo) params.set("lastActiveTo", new Date(lastActiveTo).toISOString());
    return params.toString();
  }, [
    search,
    signedUpFrom,
    signedUpTo,
    lastActiveFrom,
    lastActiveTo,
    activityFilter,
    categoryFilter,
    sortBy,
    sortDir,
  ]);

  const hasFilters =
    search ||
    signedUpFrom ||
    signedUpTo ||
    lastActiveFrom ||
    lastActiveTo ||
    activityFilter !== "all" ||
    categoryFilter !== "";
  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;

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
          <label className="mb-1 block text-xs font-medium text-ink-muted">Activity</label>
          <select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          >
            {ACTIVITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Category interest</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          >
            <option value="">Any category</option>
            {categories.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category} ({c.userCount.toLocaleString()})
              </option>
            ))}
            <option value="none">No category signal</option>
          </select>
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
              setActivityFilter("all");
              setCategoryFilter("");
            }}
            className="rounded-lg border border-border px-2 py-1.5 text-xs text-ink-muted hover:bg-surface"
          >
            Clear
          </button>
        )}
        {data && <span className="text-sm text-ink-muted">{data.totalCount.toLocaleString()} users</span>}
        <ExportButton
          label="users"
          csvHref="/api/all-users/csv"
          xlsxHref="/api/all-users/xlsx"
          params={exportParams}
          maxRows={EXPORT_ROW_CAP}
          className="ml-auto"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised">
            <tr>
              <th className="w-8 border-b border-border p-2" />
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Name</th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Phone</th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                Signed up (installed)
              </th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                Last active
              </th>
              <th
                className="whitespace-nowrap border-b border-border p-2 text-right font-medium text-ink"
                title="Total tracked activities (chat, trust, pool join/create, PG search, flat/flatmate listing)"
              >
                Activities
              </th>
              <th
                className="whitespace-nowrap border-b border-border p-2 text-right font-medium text-ink"
                title="Distinct calendar days on which the user did any activity"
              >
                Active days
              </th>
              <th
                className="whitespace-nowrap border-b border-border p-2 text-right font-medium text-ink"
                title="Engagement density = activities ÷ active days (avg activities per active day)"
              >
                Density
              </th>
              <th
                className="whitespace-nowrap border-b border-border p-2 text-right font-medium text-ink"
                title="Retention = active days ÷ days since signup (fraction of lifetime active)"
              >
                Retention
              </th>
              <th
                className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink"
                title="Category the user views most, from their per-tag affinity rolled up to its tag category. Shows views (and dwell time on hover). Blank = no category signal recorded for this user."
              >
                Top category
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
                <td colSpan={13} className="p-4 text-center text-ink-muted">
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="h-4 w-4" /> Loading…
                  </span>
                </td>
              </tr>
            )}
            {!loading &&
              data?.users.map((u) => {
                const isOpen = expanded.has(u.userId);
                return (
                  <Fragment key={u.userId}>
                    <tr
                      onClick={() => toggleUser(u.userId)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-raised"
                    >
                      <td className="p-2 text-center text-ink-muted">{isOpen ? "▾" : "▸"}</td>
                      <td className="whitespace-nowrap p-2 font-medium text-ink">{u.userName ?? u.userId}</td>
                      <td className="whitespace-nowrap p-2 text-ink">{u.phone ?? "—"}</td>
                      <td className="whitespace-nowrap p-2 text-ink" title={formatAsOf(u.signedUpAt)}>
                        {formatRelativeTime(u.signedUpAt)}
                      </td>
                      <td
                        className="whitespace-nowrap p-2 text-ink"
                        title={u.lastActiveAt ? formatAsOf(u.lastActiveAt) : ""}
                      >
                        {formatRelativeTime(u.lastActiveAt)}
                      </td>
                      <td className="whitespace-nowrap p-2 text-right text-ink">
                        {u.totalActivities.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap p-2 text-right text-ink">{u.activeDays.toLocaleString()}</td>
                      <td className="whitespace-nowrap p-2 text-right text-ink">
                        {u.engagementDensity != null ? u.engagementDensity.toLocaleString() : "—"}
                      </td>
                      <td
                        className="whitespace-nowrap p-2 text-right text-ink"
                        title={`${u.activeDays} active / ${u.daysSinceSignup} days since signup`}
                      >
                        {u.retentionScore != null ? u.retentionScore.toFixed(3) : "—"}
                      </td>
                      <td
                        className="whitespace-nowrap p-2 text-ink"
                        title={
                          u.topCategory
                            ? `${u.topCategoryViews?.toLocaleString() ?? 0} views` +
                              (u.topCategoryDwellMs
                                ? `, ${(u.topCategoryDwellMs / 60000).toFixed(1)} min dwell`
                                : "") +
                              ` · ${u.categoryCount} categor${u.categoryCount === 1 ? "y" : "ies"} viewed`
                            : "No category signal recorded"
                        }
                      >
                        {u.topCategory ? (
                          <span>
                            {u.topCategory}
                            <span className="text-ink-muted">
                              {" "}
                              · {(u.topCategoryViews ?? 0).toLocaleString()}
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
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
                    {isOpen && <UserActivityDetail userId={u.userId} colSpan={13} />}
                  </Fragment>
                );
              })}
            {!loading && data?.users.length === 0 && (
              <tr>
                <td colSpan={13} className="p-4 text-center text-ink-muted">
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
        Click a user to expand their full tracked-activity timeline. <b>Activities</b> = count of real tracked events
        (chat, trust action, pool joined/created, PG search, Flat/Flatmate listing). <b>Active days</b> = distinct
        calendar days with any such activity — only days the user was actually active, no interpolation.{" "}
        <b>Density</b> = activities ÷ active days. <b>Retention</b> = active days ÷ days since signup. &ldquo;Inactive&rdquo;
        means zero tracked activity. All sortable. CSV/Sheet export includes up to 10,000 users matching the current
        filters (not just this page). <b>Top category</b> = the content category the user views most, from their
        per-tag affinity rolled up to its tag category, shown with that category&rsquo;s view count; ranked by views,
        so it answers &ldquo;what are they actually looking at&rdquo;. Only about 1 in 4 users has any category
        signal — the rest show &ldquo;—&rdquo;, which is a real absence of data, not zero interest. Activity counts
        and category interest come from the nightly refresh (see &ldquo;Last refreshed&rdquo; above); signup, last
        visit and the Last activity column are live.
      </p>
    </div>
  );
}
