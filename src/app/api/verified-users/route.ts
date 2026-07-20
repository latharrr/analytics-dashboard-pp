import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUsers } from "@/lib/db/verifiedUsers";

const ROW_CAP = 500;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const dateFrom = searchParams.get("from") || undefined;
  const dateTo = searchParams.get("to") || undefined;
  const search = searchParams.get("search") || undefined;
  const college = searchParams.get("college") || undefined;

  const result = await getVerifiedUsers({ dateFrom, dateTo, search, college }, ROW_CAP);
  return NextResponse.json(result);
}
