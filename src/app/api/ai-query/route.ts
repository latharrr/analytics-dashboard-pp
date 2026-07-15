import { NextRequest, NextResponse } from "next/server";
import { getSchemaCache } from "@/lib/db/schemaCache";
import { buildSchemaContext, buildSystemPrompt } from "@/lib/ai/prompt";
import { generateSql, summarizeResult } from "@/lib/ai/groq";
import { guardSql } from "@/lib/ai/sqlGuard";
import { buildCitation } from "@/lib/ai/citation";
import { getReadonlyPool } from "@/lib/db/readonlyPool";
import { logAiQueryTurn } from "@/lib/ai/logging";
import { isSameOriginRequest } from "@/lib/security/originCheck";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";

export const maxDuration = 30;

const MAX_QUESTION_LENGTH = 2000;

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  }

  const allowed = await checkRateLimit(getClientIp(request), {
    route: "ai-query",
    windowSeconds: 60,
    maxRequests: 20,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const question: string | undefined = body?.question;

  if (!question || typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "Missing question." }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: `Question is too long (max ${MAX_QUESTION_LENGTH} characters).` }, { status: 413 });
  }

  const cache = await getSchemaCache();
  if (!cache) {
    return NextResponse.json(
      { error: "Schema cache is empty. Run npm run generate-schema-cache first." },
      { status: 503 }
    );
  }

  const systemPrompt = buildSystemPrompt(buildSchemaContext(cache));

  let rawSql: string;
  try {
    rawSql = await generateSql(systemPrompt, question);
  } catch (err) {
    return NextResponse.json({ error: `AI provider error: ${(err as Error).message}` }, { status: 502 });
  }

  const guard = guardSql(rawSql);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason, attemptedSql: rawSql }, { status: 422 });
  }

  const pool = getReadonlyPool();
  let rows: Record<string, unknown>[];
  try {
    const result = await pool.query(guard.sql!);
    rows = result.rows;
  } catch (err) {
    return NextResponse.json(
      { error: `Query failed: ${(err as Error).message}`, sql: guard.sql },
      { status: 400 }
    );
  }

  const answer = await summarizeResult(question, guard.sql!, rows).catch(
    () => "Query ran successfully, but I couldn't summarize the result in words. See the raw rows below."
  );
  const citation = buildCitation(guard.sql!, rows.length);

  await logAiQueryTurn({ question, sql: guard.sql!, answer, rowCount: rows.length });

  return NextResponse.json({
    answer,
    citation,
    sql: guard.sql,
    rows: rows.slice(0, 50),
    rowCount: rows.length,
  });
}
