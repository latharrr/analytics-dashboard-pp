import { NextRequest, NextResponse } from "next/server";
import { getAskAroundByNewUsers } from "@/lib/db/poolBreakdown";

const ALLOWED_DAYS = [1, 7, 15, 30];

export async function GET(request: NextRequest) {
  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 7;

  const result = await getAskAroundByNewUsers(days);

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  return NextResponse.json({ days, from: from.toISOString(), to: to.toISOString(), ...result });
}
