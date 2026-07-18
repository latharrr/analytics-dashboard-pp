import { NextRequest, NextResponse } from "next/server";
import { getPgFlatLeads } from "@/lib/db/pgFlatLeads";
import { toCsv } from "@/lib/db/explorer";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";

const CSV_ROW_CAP = 5_000;

export async function GET(request: NextRequest) {
  // Stricter than the Explorer's CSV limiter: this export contains names and phone numbers.
  const allowed = await checkRateLimit(getClientIp(request), {
    route: "pg-flat-leads-csv",
    windowSeconds: 60,
    maxRequests: 5,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const dateFrom = request.nextUrl.searchParams.get("from") || undefined;
  const dateTo = request.nextUrl.searchParams.get("to") || undefined;

  const { leads } = await getPgFlatLeads(dateFrom, dateTo, CSV_ROW_CAP);
  const csv = toCsv(
    leads.map((l) => ({
      name: l.userName,
      phone: l.phone,
      activity_type: l.activityType,
      occurred_at: l.occurredAt,
      detail: l.detail,
      user_id: l.userId,
    }))
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pg-flat-leads.csv"`,
    },
  });
}
