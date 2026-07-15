import { NextRequest, NextResponse } from "next/server";
import { refreshSchemaCache } from "@/lib/db/refreshSchemaCache";

export const maxDuration = 60;

/**
 * GET, bearer-token-gated. Vercel Cron always triggers via GET and
 * automatically attaches `Authorization: Bearer $CRON_SECRET` when that env
 * var is set on the project (see vercel.json for the weekly schedule).
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const payload = await refreshSchemaCache();
    return NextResponse.json({ ok: true, tables: payload.tables.length, generated_at: payload.generated_at });
  } catch (err) {
    console.error("schema cache refresh failed:", err);
    return NextResponse.json({ error: "refresh failed" }, { status: 500 });
  }
}
