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
  if (error || !data) return { users: [], totalCount: 0 };

  const rows = data as DetailRow[];
  return {
    users: rows.map((r) => ({
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
    })),
    totalCount: rows[0]?.total_count ?? 0,
  };
}
