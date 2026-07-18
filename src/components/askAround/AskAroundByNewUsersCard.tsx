"use client";

import { useEffect, useState } from "react";
import { formatAsOf } from "@/lib/format";

const RANGES = [1, 7, 15, 30] as const;

interface ApiResponse {
  days: number;
  from: string;
  to: string;
  newUsers: number;
  askAroundCreators: number;
  digilockerOnly: number;
  collegeOnly: number;
  both: number;
  neither: number;
  botCreators: number;
}

export function AskAroundByNewUsersCard() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const [data, setData] = useState<ApiResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/ask-around-by-new-users?days=${days}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json: ApiResponse) => setData(json))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      });
    return () => controller.abort();
  }, [days]);

  const pct = data && data.newUsers > 0 ? `${Math.round((data.askAroundCreators / data.newUsers) * 1000) / 10}%` : "N/A";

  return (
    <div className="viz-root rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-ink">Ask Around created by new users</h3>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={`rounded-lg border px-2 py-1 text-xs ${
                days === r
                  ? "border-accent bg-accent/10 font-medium text-accent"
                  : "border-border text-ink-muted hover:bg-surface-raised"
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {data ? (
        <>
          <p className="mb-3 text-[11px] text-ink-muted/70">
            {formatAsOf(data.from)} → {formatAsOf(data.to)}
          </p>
          <p className="text-sm text-ink">
            <span className="font-semibold">{data.askAroundCreators.toLocaleString()}</span> of{" "}
            {data.newUsers.toLocaleString()} new users created an Ask Around ({pct})
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-muted sm:grid-cols-4">
            <div>
              Digilocker only
              <div className="text-sm font-medium text-ink">{data.digilockerOnly.toLocaleString()}</div>
            </div>
            <div>
              College ID only
              <div className="text-sm font-medium text-ink">{data.collegeOnly.toLocaleString()}</div>
            </div>
            <div>
              Both
              <div className="text-sm font-medium text-ink">{data.both.toLocaleString()}</div>
            </div>
            <div>
              Neither
              <div className="text-sm font-medium text-ink">{data.neither.toLocaleString()}</div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-muted/70">
            Bot accounts that also created one (excluded above): {data.botCreators.toLocaleString()}
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-muted">Loading…</p>
      )}
    </div>
  );
}
