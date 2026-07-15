import type { CachedTable, SchemaCachePayload } from "@/lib/db/refreshSchemaCache";

// uuid/jsonb sample values burn tokens without helping SQL generation (the
// model never needs to know a specific row's id or nested JSON blob, just
// that the column exists and its type). Dropping them was the single
// biggest lever after this hit Groq's free-tier TPM limit in practice
// (33k tokens requested against a 12k/min cap) with all 79 tables' full
// sample rows included on every request.
const SKIP_SAMPLE_TYPES = new Set(["uuid", "jsonb", "json"]);
const MAX_STRING_LEN = 40;

// Hard ceiling on the schema section's size, independent of the above
// trimming, so token usage stays bounded even as the schema grows over
// time (more tables/columns) rather than scaling unbounded. All 73
// current business tables fit in ~35k chars (~8.8k tokens) with the
// trimming above; 40k leaves headroom for schema growth while still
// comfortably clearing Groq's free-tier 12k-token/min cap once the
// question and the 800-token completion budget are added in.
const MAX_SCHEMA_CONTEXT_CHARS = 40_000;

function compactSampleRow(table: CachedTable): Record<string, unknown> | null {
  const row = table.sample_rows[0];
  if (!row) return null;

  const typeByColumn = new Map(table.columns.map((c) => [c.name, c.type]));
  const compact: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const type = typeByColumn.get(key);
    if (type && SKIP_SAMPLE_TYPES.has(type)) continue;
    compact[key] =
      typeof value === "string" && value.length > MAX_STRING_LEN
        ? `${value.slice(0, MAX_STRING_LEN)}...`
        : value;
  }
  return Object.keys(compact).length ? compact : null;
}

function describeTable(t: CachedTable): string {
  const cols = t.columns.map((c) => `${c.name} ${c.type}${c.nullable ? "" : " NOT NULL"}`).join(", ");
  const sample = compactSampleRow(t);
  const sampleText = sample ? `\n  sample: ${JSON.stringify(sample)}` : "";
  return `- ${t.table} (${t.row_count.toLocaleString()} rows): ${cols}${sampleText}`;
}

export function buildSchemaContext(cache: SchemaCachePayload): string {
  const descriptions = cache.tables.filter((t) => !t.excluded).map(describeTable);

  let budget = MAX_SCHEMA_CONTEXT_CHARS;
  const included: string[] = [];
  let omitted = 0;
  for (const desc of descriptions) {
    if (desc.length + 1 > budget) {
      omitted++;
      continue;
    }
    included.push(desc);
    budget -= desc.length + 1;
  }

  const omittedNote =
    omitted > 0
      ? `\n(${omitted} additional table(s) omitted from this context to stay within the model's token limit.)`
      : "";
  return included.join("\n") + omittedNote;
}

export function buildSystemPrompt(schemaContext: string): string {
  return `You are a Postgres SQL generator for Picapool's analytics database.

Schema (table (row count): columns, with one sample row where useful):
${schemaContext}

Rules:
- Output ONLY a single read-only SQL statement (SELECT or WITH). No prose, no markdown fences, no explanation.
- Never write INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/GRANT/REVOKE or any other mutation.
- Never touch tables not listed above.
- Prefer explicit column lists over SELECT * when the question only needs a few fields.
- Add a LIMIT clause (max 1000) unless the query already aggregates to a single row.
- Use ISO date arithmetic (e.g. now() - interval '30 days') for relative time windows.`;
}
