import { getServiceClient } from "@/lib/supabase/server";

export interface AllUser {
  userId: string;
  userName: string | null;
  phone: string | null;
  signedUpAt: string;
  lastActiveAt: string | null;
  trustScore: number | null;
  isVerified: boolean;
  isBanned: boolean;
  lastActivityType: string | null;
  lastActivityDetail: string | null;
  lastActivityOccurredAt: string | null;
}

export interface AllUsersResult {
  users: AllUser[];
  totalCount: number;
}

export type AllUsersSortBy = "last_active" | "signed_up" | "name" | "trust_score";
export type SortDir = "asc" | "desc";

export interface AllUsersFilters {
  search?: string;
  signedUpFrom?: string;
  signedUpTo?: string;
  lastActiveFrom?: string;
  lastActiveTo?: string;
  sortBy?: AllUsersSortBy;
  sortDir?: SortDir;
}

interface DetailRow {
  user_id: string;
  user_name: string | null;
  phone: string | null;
  signed_up_at: string;
  last_active_at: string | null;
  trust_score: number | null;
  is_verified: boolean;
  is_banned: boolean;
  last_activity_type: string | null;
  last_activity_detail: string | null;
  last_activity_occurred_at: string | null;
  total_count: number;
}

/**
 * Every (non-bot) user, with signup date, last visit, and their single
 * most recent tracked activity. Backed by analytics_all_users_detail()
 * (migration 031). Genuinely paginated — this covers the whole user
 * base, not a small cohort.
 */
export async function getAllUsers(
  filters: AllUsersFilters,
  page: number,
  pageSize: number
): Promise<AllUsersResult> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_all_users_detail", {
    search_text: filters.search ?? null,
    signed_up_from: filters.signedUpFrom ?? null,
    signed_up_to: filters.signedUpTo ?? null,
    last_active_from: filters.lastActiveFrom ?? null,
    last_active_to: filters.lastActiveTo ?? null,
    sort_by: filters.sortBy ?? "last_active",
    sort_dir: filters.sortDir ?? "desc",
    page_number: page,
    page_size: pageSize,
  });
  if (error) {
    console.error("getAllUsers failed:", error.message);
    return { users: [], totalCount: 0 };
  }
  if (!data) return { users: [], totalCount: 0 };

  const rows = data as DetailRow[];
  return {
    users: rows.map(mapRow),
    totalCount: rows[0]?.total_count ?? 0,
  };
}

function mapRow(r: DetailRow): AllUser {
  return {
    userId: r.user_id,
    userName: r.user_name,
    phone: r.phone,
    signedUpAt: r.signed_up_at,
    lastActiveAt: r.last_active_at,
    trustScore: r.trust_score,
    isVerified: r.is_verified,
    isBanned: r.is_banned,
    lastActivityType: r.last_activity_type,
    lastActivityDetail: r.last_activity_detail,
    lastActivityOccurredAt: r.last_activity_occurred_at,
  };
}

/** PostgREST caps every response (including RPC results) at this project's "Max rows = 1000", so a single call can never return more than 1000 rows regardless of the SQL-side page_size. */
const EXPORT_PAGE_SIZE = 1000;

/**
 * All users matching the filters, for CSV/XLSX export — paginated past the
 * 1000-row PostgREST response cap by looping page_number. Without this, an
 * export of a >1000-user base is silently truncated to 1000 rows even though
 * the SQL function would return up to `cap`.
 */
export async function getAllUsersForExport(filters: AllUsersFilters, cap = 10_000): Promise<AllUser[]> {
  const all: AllUser[] = [];
  for (let page = 1; all.length < cap; page++) {
    const { users } = await getAllUsers(filters, page, EXPORT_PAGE_SIZE);
    all.push(...users);
    if (users.length < EXPORT_PAGE_SIZE) break;
  }
  return all.slice(0, cap);
}
