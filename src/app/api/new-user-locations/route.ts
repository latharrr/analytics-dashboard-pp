import { NextRequest, NextResponse } from "next/server";
import { getNewUserLocations, getNewUserLocationsSummary } from "@/lib/db/newUserLocations";

const ALLOWED_DAYS = [1, 7, 15, 30];

// Summary/detail are paged past PostgREST's 1000-row cap and may geocode; allow more time.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 7;

  const [summary, result] = await Promise.all([
    getNewUserLocationsSummary(days),
    getNewUserLocations(days, 500),
  ]);

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  return NextResponse.json({
    days,
    from: from.toISOString(),
    to: to.toISOString(),
    summary,
    users: result.users,
    totalCount: result.totalCount,
  });
}
