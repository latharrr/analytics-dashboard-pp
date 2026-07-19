"use client";

import { useEffect, useState } from "react";
import { BarChartCard, type BarDatum } from "@/components/kpi/BarChartCard";
import { Spinner } from "@/components/Spinner";
import { formatAsOf } from "@/lib/format";

const RANGES = [1, 7, 15, 30] as const;

interface ApiUser {
  userId: string;
  userName: string | null;
  phone: string | null;
  locationLabel: string;
  signedUpAt: string;
}

interface ApiResponse {
  days: number;
  from: string;
  to: string;
  summary: BarDatum[];
  users: ApiUser[];
  totalCount: number;
}

export function NewUserLocationsView() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/new-user-locations?days=${days}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json: ApiResponse) => setData(json))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [days]);

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
        {data && <span className="ml-2 text-sm text-ink-muted">{data.totalCount.toLocaleString()} new users</span>}
        <a
          href={`/api/new-user-locations/csv?days=${days}`}
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
          <div className="mb-6">
            <BarChartCard title="New users by location" data={data.summary} valueLabel="new users" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-raised">
                <tr>
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Name</th>
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Phone</th>
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Location</th>
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Signed up</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.userId} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap p-2 text-ink">{u.userName ?? "—"}</td>
                    <td className="whitespace-nowrap p-2 text-ink">{u.phone ?? "—"}</td>
                    <td className="whitespace-nowrap p-2 text-ink">{u.locationLabel}</td>
                    <td className="whitespace-nowrap p-2 text-ink">{formatAsOf(u.signedUpAt)}</td>
                  </tr>
                ))}
                {data.users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-ink-muted">
                      No new users in this window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink-muted/70">
            Showing the {data.users.length.toLocaleString()} most recent signups (capped at 500 on-page; CSV export
            includes up to 5,000).
          </p>
        </>
      )}
    </div>
  );
}
