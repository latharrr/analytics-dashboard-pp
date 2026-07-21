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
  totalActivities: number;
  activeDays: number;
  daysSinceSignup: number;
  engagementDensity: number | null;
  retentionScore: number | null;
  lastActivityType: string | null;
  lastActivityDetail: string | null;
  lastActivityOccurredAt: string | null;
}

export interface AllUsersResult {
  users: AllUser[];
  totalCount: number;
}

export type AllUsersSortBy =
  | "last_active"
  | "signed_up"
  | "name"
  | "trust_score"
  | "activities"
  | "engagement_density"
  | "retention_score";
export type SortDir = "asc" | "desc";
export type ActivityFilter = "all" | "active" | "inactive";

export interface AllUsersFilters {
  search?: string;
  signedUpFrom?: string;
  signedUpTo?: string;
  lastActiveFrom?: string;
  lastActiveTo?: string;
  activityFilter?: ActivityFilter;
  sortBy?: AllUsersSortBy;
  sortDir?: SortDir;
}

/** One event in a user's full activity timeline. Backed by analytics_user_activity_detail() (migration 040). */
export interface UserActivityDetailEvent {
  activityType: string;
  occurredAt: string;
  detail: string | null;
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
  total_activities: number | string;
  active_days: number | string;
  days_since_signup: number;
  engagement_density: number | string | null;
  retention_score: number | string | null;
  last_activity_type: string | null;
  last_activity_detail: string | null;
  last_activity_occurred_at: string | null;
  total_count: number;
}

/**
 * Every (non-bot) user, with signup date, last visit, their most recent tracked
 * activity, and engagement/retention scores. Backed by
 * analytics_all_users_engagement() (migration 044): total_activities and
 * active_days (distinct days with real activity), engagement_density
 * (activities/active-day) and retention_score (active-days/days-since-signup).
 * Genuinely paginated — covers the whole user base, sorted globally.
 */
export async function getAllUsers(
  filters: AllUsersFilters,
  page: number,
  pageSize: number
): Promise<AllUsersResult> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_all_users_engagement", {
    search_text: filters.search ?? null,
    signed_up_from: filters.signedUpFrom ?? null,
    signed_up_to: filters.signedUpTo ?? null,
    last_active_from: filters.lastActiveFrom ?? null,
    last_active_to: filters.lastActiveTo ?? null,
    activity_filter: filters.activityFilter ?? "all",
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

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
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
    totalActivities: toNum(r.total_activities) ?? 0,
    activeDays: toNum(r.active_days) ?? 0,
    daysSinceSignup: r.days_since_signup,
    engagementDensity: toNum(r.engagement_density),
    retentionScore: toNum(r.retention_score),
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

/**
 * The full tracked-activity timeline for a single user (all-time), for the
 * expand-on-demand rows on All Users and New User Activity's "All users" mode.
 * Backed by analytics_user_activity_detail() (migration 040) — one cheap call
 * per user (indexed by user column), so this stays well under the 1000-row cap.
 */
export async function getUserActivityDetail(userId: string): Promise<UserActivityDetailEvent[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_user_activity_detail", { target_user: userId });
  if (error) {
    console.error("getUserActivityDetail failed:", error.message);
    return [];
  }
  if (!data) return [];
  return (data as { activity_type: string; occurred_at: string; detail: string | null }[]).map((r) => ({
    activityType: r.activity_type,
    occurredAt: r.occurred_at,
    detail: r.detail,
  }));
}
