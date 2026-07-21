import { NextRequest, NextResponse } from "next/server";
import { getNewUserActivityDetailFlat } from "@/lib/db/newUserActivity";
import type { ActivityFilter } from "@/lib/db/allUsers";
import { toCsv } from "@/lib/db/explorer";
import { parseLimitParam } from "@/lib/db/exportParams";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";

const ALLOWED_DAYS = [1, 7, 15, 30];
const ALLOWED_FILTERS: ActivityFilter[] = ["all", "active", "inactive"];
const CSV_ROW_CAP = 5_000;

// Paged past PostgREST's 1000-row cap; a wide window can be tens of thousands of rows.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  // Contains phone numbers, so this uses the stricter PII limit (matches PG/Flat Leads, Verified Users).
  const allowed = await checkRateLimit(getClientIp(request), {
    route: "new-user-activity-csv",
    windowSeconds: 60,
    maxRequests: 5,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 7;

  const filterParam = request.nextUrl.searchParams.get("activityFilter") as ActivityFilter | null;
  const activityFilter: ActivityFilter =
    filterParam && ALLOWED_FILTERS.includes(filterParam) ? filterParam : "all";

  // Row limit comes from the export panel (PR #11's picker); filter is ours (041).
  const rows = await getNewUserActivityDetailFlat(days, activityFilter, parseLimitParam(request, CSV_ROW_CAP));
  const csv = toCsv(
    rows.map((e) => ({
      user_id: e.userId,
      user_name: e.userName,
      phone: e.phone,
      signed_up_at: e.signedUpAt,
      activity_type: e.activityType,
      occurred_at: e.occurredAt,
      detail: e.detail,
    }))
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="new-user-activity-${days}d-${activityFilter}.csv"`,
    },
  });
}
