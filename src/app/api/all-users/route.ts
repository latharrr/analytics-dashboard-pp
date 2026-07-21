import { NextRequest, NextResponse } from "next/server";
import { getAllUsers, type AllUsersSortBy, type SortDir, type ActivityFilter } from "@/lib/db/allUsers";

const PAGE_SIZE = 50;
const ALLOWED_SORT: AllUsersSortBy[] = [
  "last_active",
  "signed_up",
  "name",
  "trust_score",
  "activities",
  "engagement_density",
  "retention_score",
];
const ALLOWED_FILTERS: ActivityFilter[] = ["all", "active", "inactive"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const sortByParam = params.get("sortBy") as AllUsersSortBy | null;
  const sortBy = sortByParam && ALLOWED_SORT.includes(sortByParam) ? sortByParam : "last_active";
  const sortDir: SortDir = params.get("sortDir") === "asc" ? "asc" : "desc";
  const filterParam = params.get("activityFilter") as ActivityFilter | null;
  const activityFilter: ActivityFilter =
    filterParam && ALLOWED_FILTERS.includes(filterParam) ? filterParam : "all";

  const result = await getAllUsers(
    {
      search: params.get("search") || undefined,
      signedUpFrom: params.get("signedUpFrom") || undefined,
      signedUpTo: params.get("signedUpTo") || undefined,
      lastActiveFrom: params.get("lastActiveFrom") || undefined,
      lastActiveTo: params.get("lastActiveTo") || undefined,
      activityFilter,
      sortBy,
      sortDir,
    },
    page,
    PAGE_SIZE
  );
  return NextResponse.json({ ...result, page, pageSize: PAGE_SIZE });
}
