import { NextResponse } from "next/server";
import { getAllUsersCategories } from "@/lib/db/allUsers";

/**
 * The category list for the All Users category filter. Reads the precomputed
 * roster view (migration 048), so it's a grouped scan of ~7.5k small rows —
 * no PII, so no rate limit needed here.
 *
 * force-dynamic is required: this route takes no request params, so without it
 * Next prerenders it at build time (where there is no DB) and every request
 * would be served an empty, permanently-stale category list.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const categories = await getAllUsersCategories();
  return NextResponse.json({ categories });
}
