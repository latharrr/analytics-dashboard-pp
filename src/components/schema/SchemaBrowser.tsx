"use client";

import { useMemo, useState } from "react";
import type { SchemaCachePayload } from "@/lib/db/refreshSchemaCache";
import { MODULES } from "@/lib/modules";

const MODULE_LABELS = Object.fromEntries(MODULES.map((m) => [m.key, m.label]));

export function SchemaBrowser({ cache }: { cache: SchemaCachePayload | null }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const excludedTables = cache?.tables.filter((t) => t.excluded) ?? [];

  const filtered = useMemo(() => {
    const businessTables = cache?.tables.filter((t) => !t.excluded) ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return businessTables;
    return businessTables.filter(
      (t) =>
        t.table.toLowerCase().includes(q) ||
        t.columns.some((c) => c.name.toLowerCase().includes(q))
    );
  }, [cache, search]);

  if (!cache) {
    return (
      <p className="text-sm text-ink-muted">
        No schema cache yet. Run <code>npm run generate-schema-cache</code> once your
        env vars are set.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 sm:justify-between">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tables or columns…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink sm:w-72"
        />
        <span className="text-xs text-ink-muted">
          {cache.tables.length} tables total · generated{" "}
          {new Date(cache.generated_at).toLocaleString()}
        </span>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border">
        {filtered.map((t) => {
          const isOpen = expanded === t.table;
          return (
            <div key={t.table}>
              <button
                onClick={() => setExpanded(isOpen ? null : t.table)}
                className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-left hover:bg-surface-raised"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{t.table}</span>
                  <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs text-ink-muted">
                    {MODULE_LABELS[t.module] ?? t.module}
                  </span>
                </span>
                <span className="text-xs text-ink-muted">
                  {t.row_count.toLocaleString()} rows · {t.size_pretty}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-border bg-surface-raised px-4 py-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-ink-muted">
                        <th className="pb-1 font-normal">Column</th>
                        <th className="pb-1 font-normal">Type</th>
                        <th className="pb-1 font-normal">Nullable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.columns.map((c) => (
                        <tr key={c.name} className="border-t border-border">
                          <td className="py-1 text-ink">{c.name}</td>
                          <td className="py-1 text-ink-muted">{c.type}</td>
                          <td className="py-1 text-ink-muted">{c.nullable ? "yes" : "no"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-ink-muted">No tables match.</p>
        )}
      </div>

      {excludedTables.length > 0 && (
        <details className="mt-4 rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm text-ink-muted">
            Postgres / PostGIS internals ({excludedTables.length}): not business data, excluded
            from the Data Explorer and AI Query engine
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-ink-muted">
            {excludedTables.map((t) => (
              <li key={t.table}>
                {t.table} · {t.row_count.toLocaleString()} rows · {t.size_pretty}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
