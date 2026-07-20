import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUsers, type VerificationFilter } from "@/lib/db/verifiedUsers";

const ROW_CAP = 500;
const ALLOWED_VERIFICATION: VerificationFilter[] = ["both", "digilocker", "college", "either"];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const dateFrom = searchParams.get("from") || undefined;
  const dateTo = searchParams.get("to") || undefined;
  const search = searchParams.get("search") || undefined;
  const college = searchParams.get("college") || undefined;
  const verificationParam = searchParams.get("verification") as VerificationFilter | null;
  const verificationFilter = verificationParam && ALLOWED_VERIFICATION.includes(verificationParam)
    ? verificationParam
    : "both";

  const result = await getVerifiedUsers({ dateFrom, dateTo, search, college, verificationFilter }, ROW_CAP);
  return NextResponse.json(result);
}
