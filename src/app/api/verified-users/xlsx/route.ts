import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUsers, type VerificationFilter } from "@/lib/db/verifiedUsers";
import { toXlsxBuffer } from "@/lib/db/explorer";
import { parseLimitParam } from "@/lib/db/exportParams";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";

const XLSX_ROW_CAP = 5_000;
const ALLOWED_VERIFICATION: VerificationFilter[] = ["both", "digilocker", "college", "either"];

export async function GET(request: NextRequest) {
  // Stricter than the Explorer's XLSX limiter: this export contains names and phone numbers.
  const allowed = await checkRateLimit(getClientIp(request), {
    route: "verified-users-xlsx",
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
  const verificationParam = searchParams.get("verification") as VerificationFilter | null;
  const verificationFilter = verificationParam && ALLOWED_VERIFICATION.includes(verificationParam)
    ? verificationParam
    : "both";

  const { users } = await getVerifiedUsers(
    { dateFrom, dateTo, search, college, verificationFilter },
    parseLimitParam(request, XLSX_ROW_CAP)
  );
  const buffer = toXlsxBuffer(
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
    })),
    "verified-users"
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="verified-users.xlsx"`,
    },
  });
}
