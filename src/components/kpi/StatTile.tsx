import { formatValue, humanizeKey } from "@/lib/format";

export interface StatTileProps {
  label: string;
  value: unknown;
  /** Percent change vs. prior period, if known. Positive = good, negative = bad. */
  delta?: number | null;
  /** Set true when a negative delta is actually the desired direction (e.g. churn). */
  invertDelta?: boolean;
}

export function StatTile({ label, value, delta, invertDelta }: StatTileProps) {
  const hasDelta = typeof delta === "number" && !Number.isNaN(delta);
  const isGood = hasDelta && (invertDelta ? delta! < 0 : delta! > 0);
  const isBad = hasDelta && (invertDelta ? delta! > 0 : delta! < 0);

  return (
    <div className="viz-root rounded-xl border border-border bg-surface p-4">
      <p className="text-sm text-ink-muted">{humanizeKey(label)}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{formatValue(value)}</p>
      {hasDelta && (
        <p
          className="mt-1 text-xs font-medium"
          style={{ color: isGood ? "var(--viz-good)" : isBad ? "var(--viz-critical)" : "var(--viz-text-muted)" }}
        >
          {delta! > 0 ? "↑" : delta! < 0 ? "↓" : "→"} {Math.abs(delta!).toFixed(1)}%
        </p>
      )}
    </div>
  );
}

/** Renders every scalar field of a single-row KPI snapshot as a grid of stat tiles. */
export function StatTileGrid({ row }: { row: Record<string, unknown> | null }) {
  if (!row) {
    return <p className="text-sm text-ink-muted">No data yet. Has the materialized view been refreshed?</p>;
  }
  const entries = Object.entries(row).filter(([, v]) => typeof v !== "object" || v === null);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {entries.map(([key, value]) => (
        <StatTile key={key} label={key} value={value} />
      ))}
    </div>
  );
}
