import { NextRequest, NextResponse } from "next/server";
import { getPoolCategoryUsers } from "@/lib/db/categoryIntent";

const ROW_CAP = 500;

/**
 * The users behind one pool category, for the expand-on-click rows on Category
 * Intent. Reads the precomputed mv_pool_category_users (migration 051).
 */
export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");
  if (!category) {
    return NextResponse.json({ error: "category is required" }, { status: 400 });
  }
  const result = await getPoolCategoryUsers(category, ROW_CAP);
  return NextResponse.json({ ...result, rowCap: ROW_CAP });
}
