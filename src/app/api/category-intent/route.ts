import { NextResponse } from "next/server";
import { getCategoryIntent, getPoolCategoryIntent } from "@/lib/db/categoryIntent";

/**
 * Platform-wide category intent. Reads the precomputed mv_category_intent
 * (11 rows), no PII, so no rate limit.
 *
 * force-dynamic: this route takes no request params, so without it Next
 * prerenders it at build time (where there is no DB) and serves a permanently
 * empty result.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const [categories, poolCategories] = await Promise.all([getCategoryIntent(), getPoolCategoryIntent()]);
  return NextResponse.json({ categories, poolCategories });
}
