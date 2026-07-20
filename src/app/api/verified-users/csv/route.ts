import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUsers } from "@/lib/db/verifiedUsers";
import { toCsv } from "@/lib/db/explorer";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";

const CSV_ROW_CAP = 5_000;

export async function GET(request: NextRequest) {
  // Stricter than the Explorer's CSV limiter: this export contains names and phone numbers.
  const allowed = await checkRateLimit(getClientIp(request), {
    route: "verified-users-csv",
    windowSeconds: 60,
    maxRequests: 5,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const searchParams = request.nextUrl.searchParams;
  const dateFrom = searchParams.get("from") || undefined;
  const dateTo = searchParams.get("to") || undefined;
  const search = searchParams.get("search") || undefined;
  const college = searchParams.get("college") || undefined;

  const { users } = await getVerifiedUsers({ dateFrom, dateTo, search, college }, CSV_ROW_CAP);
  const csv = toCsv(
    users.map((u) => ({
      name: u.userName,
      phone: u.phone,
      college: u.collegeName,
      trust_score: u.trustScore,
      signed_up_at: u.signedUpAt,
      last_activity: u.lastActivity,
      digilocker_verified_at: u.digilockerVerifiedAt,
      college_verified_at: u.collegeVerifiedAt,
      user_id: u.userId,
    }))
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="verified-users.csv"`,
    },
  });
}
