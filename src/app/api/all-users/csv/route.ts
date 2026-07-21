import { NextRequest, NextResponse } from "next/server";
import { getAllUsersForExport, type AllUsersSortBy, type SortDir, type ActivityFilter } from "@/lib/db/allUsers";
import { toCsv } from "@/lib/db/explorer";
import { parseLimitParam } from "@/lib/db/exportParams";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";

const ROW_CAP = 10_000;
const ALLOWED_SORT: AllUsersSortBy[] = [
  "last_active",
  "signed_up",
  "name",
  "trust_score",
  "activities",
  "engagement_density",
  "retention_score",
];
const ALLOWED_FILTERS: ActivityFilter[] = ["all", "active", "inactive"];

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  // Covers the whole user base (name + phone), so this uses the stricter PII limit.
  const allowed = await checkRateLimit(getClientIp(request), {
    route: "all-users-csv",
    windowSeconds: 60,
    maxRequests: 5,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const params = request.nextUrl.searchParams;
  const sortByParam = params.get("sortBy") as AllUsersSortBy | null;
  const sortBy = sortByParam && ALLOWED_SORT.includes(sortByParam) ? sortByParam : "last_active";
  const sortDir: SortDir = params.get("sortDir") === "asc" ? "asc" : "desc";
  const filterParam = params.get("activityFilter") as ActivityFilter | null;
  const activityFilter: ActivityFilter =
    filterParam && ALLOWED_FILTERS.includes(filterParam) ? filterParam : "all";

  const users = await getAllUsersForExport(
    {
      search: params.get("search") || undefined,
      signedUpFrom: params.get("signedUpFrom") || undefined,
      signedUpTo: params.get("signedUpTo") || undefined,
      lastActiveFrom: params.get("lastActiveFrom") || undefined,
      lastActiveTo: params.get("lastActiveTo") || undefined,
      activityFilter,
      sortBy,
      sortDir,
    },
    parseLimitParam(request, ROW_CAP)
  );

  const csv = toCsv(
    users.map((u) => ({
      name: u.userName,
      phone: u.phone,
      signed_up_at: u.signedUpAt,
      last_active_at: u.lastActiveAt,
      trust_score: u.trustScore,
      is_verified: u.isVerified,
      is_banned: u.isBanned,
      total_activities: u.totalActivities,
      active_days: u.activeDays,
      days_since_signup: u.daysSinceSignup,
      engagement_density: u.engagementDensity,
      retention_score: u.retentionScore,
      last_activity_type: u.lastActivityType,
      last_activity_detail: u.lastActivityDetail,
      last_activity_at: u.lastActivityOccurredAt,
      user_id: u.userId,
    }))
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="all-users.csv"`,
    },
  });
}
