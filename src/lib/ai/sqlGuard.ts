const WRITE_KEYWORDS =
  /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|call|copy|vacuum|reindex|do|merge)\b/i;

export interface SqlGuardResult {
  ok: boolean;
  reason?: string;
  sql?: string;
}

/**
 * Validates AI-generated SQL before it's ever handed to the analytics_readonly
 * connection. Rejects anything that isn't a single read-only SELECT/CTE
 * statement, and injects a LIMIT if the model forgot one.
 */
export function guardSql(rawSql: string): SqlGuardResult {
  const sql = rawSql.trim().replace(/```sql|```/gi, "").trim();

  if (!sql) {
    return { ok: false, reason: "Model returned no SQL." };
  }

  // Multi-statement: a `;` followed by more non-whitespace content.
  const withoutTrailingSemicolon = sql.replace(/;+\s*$/, "");
  if (/;\s*\S/.test(withoutTrailingSemicolon)) {
    return { ok: false, reason: "Multiple SQL statements are not allowed." };
  }

  if (WRITE_KEYWORDS.test(withoutTrailingSemicolon)) {
    return { ok: false, reason: "Only read-only queries are allowed." };
  }

  if (!/^(select|with)\b/i.test(withoutTrailingSemicolon.trim())) {
    return { ok: false, reason: "Only SELECT/WITH queries are allowed." };
  }

  const hasLimit = /\blimit\s+\d+/i.test(withoutTrailingSemicolon);
  const finalSql = hasLimit ? withoutTrailingSemicolon : `${withoutTrailingSemicolon}\nLIMIT 1000`;

  return { ok: true, sql: finalSql };
}
