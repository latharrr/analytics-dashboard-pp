import { NextRequest, NextResponse } from "next/server";
import { getNewUserActivitySummary, getNewUserActivityByUser } from "@/lib/db/newUserActivity";
import type { ActivityFilter } from "@/lib/db/allUsers";

const ALLOWED_DAYS = [1, 7, 15, 30];
const ALLOWED_FILTERS: ActivityFilter[] = ["all", "active", "inactive"];

// The by-user detail can page past PostgREST's 1000-row cap, so allow more time.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 7;

  const filterParam = request.nextUrl.searchParams.get("activityFilter") as ActivityFilter | null;
  const activityFilter: ActivityFilter =
    filterParam && ALLOWED_FILTERS.includes(filterParam) ? filterParam : "all";

  const [summary, users] = await Promise.all([
    getNewUserActivitySummary(days),
    getNewUserActivityByUser(days, activityFilter, 500),
  ]);

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  return NextResponse.json({
    days,
    activityFilter,
    from: from.toISOString(),
    to: to.toISOString(),
    summary,
    users,
  });
}
