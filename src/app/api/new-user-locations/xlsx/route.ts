import { NextRequest, NextResponse } from "next/server";
import { getNewUserLocations } from "@/lib/db/newUserLocations";
import { toXlsxBuffer } from "@/lib/db/explorer";
import { parseLimitParam } from "@/lib/db/exportParams";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";

const ALLOWED_DAYS = [1, 7, 15, 30];
const XLSX_ROW_CAP = 5_000;

// Paged past PostgREST's 1000-row cap and may geocode uncached coordinates.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  // Stricter than the Explorer's XLSX limiter: this export contains names and phone numbers.
  const allowed = await checkRateLimit(getClientIp(request), {
    route: "new-user-locations-xlsx",
    windowSeconds: 60,
    maxRequests: 5,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 7;

  const { users } = await getNewUserLocations(days, parseLimitParam(request, XLSX_ROW_CAP));
  const buffer = toXlsxBuffer(
    users.map((u) => ({
      name: u.userName,
      phone: u.phone,
      location: u.locationLabel,
      signed_up_at: u.signedUpAt,
      user_id: u.userId,
    })),
    "new-user-locations"
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="new-user-locations-${days}d.xlsx"`,
    },
  });
}
