import { ALL_TRACKED_TABLES } from "@/lib/modules";

/** Extracts which known tables a query actually touched, for the "Source:" citation. */
export function extractSourceTables(sql: string): string[] {
  const found = new Set<string>();
  const pattern = /\b(?:from|join)\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql)) !== null) {
    const table = match[1].toLowerCase();
    if (ALL_TRACKED_TABLES.includes(table)) {
      found.add(table);
    }
  }
  return Array.from(found);
}

export function buildCitation(sql: string, rowCount: number): string {
  const tables = extractSourceTables(sql);
  const label = tables.length ? tables.join(", ") : "query result";
  return `Source: ${label} (${rowCount} row${rowCount === 1 ? "" : "s"})`;
}
