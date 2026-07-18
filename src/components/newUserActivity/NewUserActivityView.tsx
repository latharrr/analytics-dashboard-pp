"use client";

import { useEffect, useState } from "react";
import { StatTile } from "@/components/kpi/StatTile";
import { Spinner } from "@/components/Spinner";
import { formatAsOf } from "@/lib/format";

const RANGES = [1, 7, 15, 30] as const;

interface ApiEvent {
  userId: string;
  userName: string | null;
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

export function NewUserActivityView() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/new-user-activity?days=${days}`, { signal: controller.signal })
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
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {data.summary.map((s) => (
              <StatTile key={s.label} label={s.label} value={s.value} />
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-raised">
                <tr>
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">User</th>
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Signed up</th>
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Activity</th>
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">When</th>
                  <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.detail.map((e, i) => (
                  <tr key={`${e.userId}-${e.occurredAt}-${i}`} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap p-2 text-ink">{e.userName ?? e.userId}</td>
                    <td className="whitespace-nowrap p-2 text-ink">{formatAsOf(e.signedUpAt)}</td>
                    <td className="whitespace-nowrap p-2 text-ink">{e.activityType}</td>
                    <td className="whitespace-nowrap p-2 text-ink">{formatAsOf(e.occurredAt)}</td>
                    <td className="whitespace-nowrap p-2 text-ink">{e.detail ?? "—"}</td>
                  </tr>
                ))}
                {data.detail.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-ink-muted">
                      No activity in this window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink-muted/70">
            Showing the {data.detail.length.toLocaleString()} most recent events (capped at 500 on-page; CSV export
            includes up to 5,000).
          </p>
        </>
      )}
    </div>
  );
}
