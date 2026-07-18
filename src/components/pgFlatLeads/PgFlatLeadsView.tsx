"use client";

import { useEffect, useState } from "react";
import { formatAsOf, formatRelativeTime } from "@/lib/format";
import { Spinner } from "@/components/Spinner";

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

export function PgFlatLeadsView() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
    if (dateTo) params.set("to", new Date(dateTo).toISOString());

    fetch(`/api/pg-flat-leads?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json: ApiResponse) => setData(json))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [dateFrom, dateTo]);

  const exportParams = new URLSearchParams();
  if (dateFrom) exportParams.set("from", new Date(dateFrom).toISOString());
  if (dateTo) exportParams.set("to", new Date(dateTo).toISOString());

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-raised p-3">
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
        {(dateFrom || dateTo) && (
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            className="rounded-lg border border-border px-2 py-1.5 text-xs text-ink-muted hover:bg-surface"
          >
            Clear
          </button>
        )}
        {data && <span className="text-sm text-ink-muted">{data.totalCount.toLocaleString()} leads</span>}
        <a
          href={`/api/pg-flat-leads/csv?${exportParams.toString()}`}
          className="ml-auto rounded-lg border border-border px-3 py-1.5 text-sm text-ink hover:bg-surface-raised"
        >
          Export CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised">
            <tr>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Name</th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Phone</th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Activity</th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">When</th>
              <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Detail</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-ink-muted">
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="h-4 w-4" /> Loading…
                  </span>
                </td>
              </tr>
            )}
            {!loading &&
              data?.leads.map((l, i) => (
                <tr key={`${l.userId}-${l.occurredAt}-${i}`} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap p-2 text-ink">{l.userName ?? "—"}</td>
                  <td className="whitespace-nowrap p-2 text-ink">{l.phone ?? "—"}</td>
                  <td className="whitespace-nowrap p-2 text-ink">{l.activityType}</td>
                  <td className="whitespace-nowrap p-2 text-ink" title={formatAsOf(l.occurredAt)}>
                    {formatRelativeTime(l.occurredAt)}
                  </td>
                  <td className="whitespace-nowrap p-2 text-ink">{l.detail ?? "—"}</td>
                </tr>
              ))}
            {!loading && data?.leads.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-ink-muted">
                  No leads in this window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
