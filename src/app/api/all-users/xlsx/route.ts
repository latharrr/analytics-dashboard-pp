import { NextRequest, NextResponse } from "next/server";
import { getAllUsersForExport, type AllUsersSortBy, type SortDir } from "@/lib/db/allUsers";
import { toXlsxBuffer } from "@/lib/db/explorer";
import { parseLimitParam } from "@/lib/db/exportParams";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";

const ROW_CAP = 10_000;
const ALLOWED_SORT: AllUsersSortBy[] = ["last_active", "signed_up", "name", "trust_score"];

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  // Covers the whole user base (name + phone), so this uses the stricter PII limit.
  const allowed = await checkRateLimit(getClientIp(request), {
    route: "all-users-xlsx",
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

  const users = await getAllUsersForExport(
    {
      search: params.get("search") || undefined,
      signedUpFrom: params.get("signedUpFrom") || undefined,
      signedUpTo: params.get("signedUpTo") || undefined,
      lastActiveFrom: params.get("lastActiveFrom") || undefined,
      lastActiveTo: params.get("lastActiveTo") || undefined,
      sortBy,
      sortDir,
    },
    parseLimitParam(request, ROW_CAP)
  );

  const buffer = toXlsxBuffer(
    users.map((u) => ({
      name: u.userName,
      phone: u.phone,
      signed_up_at: u.signedUpAt,
      last_active_at: u.lastActiveAt,
      trust_score: u.trustScore,
      is_verified: u.isVerified,
      is_banned: u.isBanned,
      last_activity_type: u.lastActivityType,
      last_activity_detail: u.lastActivityDetail,
      last_activity_at: u.lastActivityOccurredAt,
      user_id: u.userId,
    })),
    "all-users"
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="all-users.xlsx"`,
    },
  });
}
