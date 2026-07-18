import { NextRequest, NextResponse } from "next/server";
import { getPgFlatLeads } from "@/lib/db/pgFlatLeads";

export async function GET(request: NextRequest) {
  const dateFrom = request.nextUrl.searchParams.get("from") || undefined;
  const dateTo = request.nextUrl.searchParams.get("to") || undefined;

  const result = await getPgFlatLeads(dateFrom, dateTo, 1000);
  return NextResponse.json(result);
}
