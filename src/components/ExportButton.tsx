"use client";

import { useEffect, useRef, useState } from "react";

interface ExportButtonProps {
  /** What's being exported, used in the panel heading, e.g. "verified users". */
  label: string;
  /** Base path for the CSV route, e.g. "/api/verified-users/csv". */
  csvHref: string;
  /** Base path for the XLSX route, e.g. "/api/verified-users/xlsx". */
  xlsxHref: string;
  /** Current filter query string (no leading "?"); the row limit is appended on top of this. */
  params?: string;
  /** Hard server-side row cap for this export — also offered as the "All matching" option. */
  maxRows: number;
  /** Smaller row-count presets offered alongside maxRows. Defaults to a few sensible sizes below maxRows. */
  rowOptions?: number[];
  className?: string;
}

const DEFAULT_PRESETS = [100, 500, 1000, 2500];

export function ExportButton({
  label,
  csvHref,
  xlsxHref,
  params,
  maxRows,
  rowOptions,
  className,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [rows, setRows] = useState(maxRows);
  const containerRef = useRef<HTMLDivElement>(null);

  const presets = (rowOptions ?? DEFAULT_PRESETS).filter((n) => n < maxRows);
  const options = [...presets, maxRows];

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [open]);

  const href = (() => {
    const base = format === "csv" ? csvHref : xlsxHref;
    const search = new URLSearchParams(params);
    search.set("limit", String(rows));
    return `${base}?${search.toString()}`;
  })();

  return (
    <div className={`relative ${className ?? ""}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-lg border border-border px-3 py-1.5 text-sm text-ink hover:bg-surface-raised"
      >
        Export ▾
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`Export ${label}`}
          className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-border bg-surface-raised p-4 shadow-lg"
        >
          <p className="mb-3 text-xs font-medium text-ink">Export {label}</p>

          <div className="mb-3">
            <p className="mb-1 text-xs font-medium text-ink-muted">Format</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormat("csv")}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-sm ${
                  format === "csv"
                    ? "border-accent bg-accent/10 font-medium text-accent"
                    : "border-border text-ink-muted hover:bg-surface"
                }`}
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => setFormat("xlsx")}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-sm ${
                  format === "xlsx"
                    ? "border-accent bg-accent/10 font-medium text-accent"
                    : "border-border text-ink-muted hover:bg-surface"
                }`}
              >
                Excel (.xlsx)
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-ink-muted">How many rows</label>
            <select
              value={rows}
              onChange={(e) => setRows(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-ink"
            >
              {options.map((n) => (
                <option key={n} value={n}>
                  {n === maxRows ? `All matching filters (up to ${n.toLocaleString()})` : `First ${n.toLocaleString()}`}
                </option>
              ))}
            </select>
          </div>

          <a
            href={href}
            onClick={() => setOpen(false)}
            className="block rounded-lg bg-accent px-3 py-1.5 text-center text-sm font-medium text-white hover:opacity-90"
          >
            Download
          </a>
        </div>
      )}
    </div>
  );
}
