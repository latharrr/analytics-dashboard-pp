import { NextRequest, NextResponse } from "next/server";
import { getNewUserLocations } from "@/lib/db/newUserLocations";
import { toCsv } from "@/lib/db/explorer";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";

const ALLOWED_DAYS = [1, 7, 15, 30];
const CSV_ROW_CAP = 5_000;

// Paged past PostgREST's 1000-row cap and may geocode uncached coordinates.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  // Stricter than the Explorer's CSV limiter: this export contains names and phone numbers.
  const allowed = await checkRateLimit(getClientIp(request), {
    route: "new-user-locations-csv",
    windowSeconds: 60,
    maxRequests: 5,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 7;

  const { users } = await getNewUserLocations(days, CSV_ROW_CAP);
  const csv = toCsv(
    users.map((u) => ({
      name: u.userName,
      phone: u.phone,
      location: u.locationLabel,
      signed_up_at: u.signedUpAt,
      user_id: u.userId,
    }))
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="new-user-locations-${days}d.csv"`,
    },
  });
}
