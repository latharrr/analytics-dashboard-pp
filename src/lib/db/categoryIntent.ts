import { getServiceClient } from "@/lib/supabase/server";

export interface CategoryIntentRow {
  category: string;
  users: number;
  tags: number;
  views: number;
  joins: number;
  likes: number;
  dwellMs: number;
  viewsPerUser: number | null;
  lastSignalAt: string | null;
  topTags: string | null;
}

interface Row {
  category: string;
  users: number | string;
  tags: number | string;
  views: number | string;
  joins: number | string;
  likes: number | string;
  dwell_ms: number | string;
  views_per_user: number | string | null;
  last_signal_at: string | null;
  top_tags: string | null;
}

function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/**
 * Platform-wide category intent — one row per tag category, from
 * mv_category_intent (migration 049). Non-bot users only.
 *
 * NOTE: a user who engages with several categories is counted in each of them,
 * so `users` summed across rows exceeds the number of distinct users. That is
 * deliberate — the question is "how many people look at this category", not a
 * partition of the user base. It also means these counts are larger than the
 * All Users page's per-category counts, which use only each user's TOP category.
 */
export async function getCategoryIntent(): Promise<CategoryIntentRow[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_category_intent");
  if (error) {
    console.error("getCategoryIntent failed:", error.message);
    return [];
  }
  if (!data) return [];
  return (data as Row[]).map((r) => ({
    category: r.category,
    users: toNum(r.users) ?? 0,
    tags: toNum(r.tags) ?? 0,
    views: toNum(r.views) ?? 0,
    joins: toNum(r.joins) ?? 0,
    likes: toNum(r.likes) ?? 0,
    dwellMs: toNum(r.dwell_ms) ?? 0,
    viewsPerUser: toNum(r.views_per_user),
    lastSignalAt: r.last_signal_at,
    topTags: r.top_tags,
  }));
}

/** One pool vertical (pools.category) — what users create and join, per migration 050. */
export interface PoolCategoryRow {
  categorySlug: string;
  category: string;
  pools: number;
  creators: number;
  joins: number;
  joiners: number;
  /** flat / flatmate / pg are listing-type pools nobody joins, so 0 joins is expected, not absent interest. */
  isListingOnly: boolean;
  newestPoolAt: string | null;
  newestJoinAt: string | null;
}

interface PoolRow {
  category_slug: string;
  category: string;
  pools: number | string;
  creators: number | string;
  joins: number | string;
  joiners: number | string;
  is_listing_only: boolean;
  newest_pool_at: string | null;
  newest_join_at: string | null;
}

/**
 * Pool categories — a different dimension from getCategoryIntent(): that one is
 * what users BROWSE (tag affinity, views/dwell), this is what they CREATE and
 * JOIN (pools.category). No view/dwell data exists for pools, so the two are
 * shown as separate tabs rather than merged into one table.
 */
export async function getPoolCategoryIntent(): Promise<PoolCategoryRow[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_pool_category_intent");
  if (error) {
    console.error("getPoolCategoryIntent failed:", error.message);
    return [];
  }
  if (!data) return [];
  return (data as PoolRow[]).map((r) => ({
    categorySlug: r.category_slug,
    category: r.category,
    pools: toNum(r.pools) ?? 0,
    creators: toNum(r.creators) ?? 0,
    joins: toNum(r.joins) ?? 0,
    joiners: toNum(r.joiners) ?? 0,
    isListingOnly: r.is_listing_only,
    newestPoolAt: r.newest_pool_at,
    newestJoinAt: r.newest_join_at,
  }));
}

/** One user behind a pool category — who created and/or joined pools there (migration 051). */
export interface PoolCategoryUser {
  userId: string;
  userName: string | null;
  phone: string | null;
  poolsCreated: number;
  poolsJoined: number;
  lastActivityAt: string | null;
  trustScore: number | null;
  isVerified: boolean;
}

export interface PoolCategoryUsersResult {
  users: PoolCategoryUser[];
  totalCount: number;
}

interface PoolUserRow {
  user_id: string;
  user_name: string | null;
  phone: string | null;
  pools_created: number | string;
  pools_joined: number | string;
  last_activity_at: string | null;
  trust_score: number | null;
  is_verified: boolean;
  total_count: number | string;
}

/**
 * The users behind one pool category, for the expand-on-click rows on Category
 * Intent. Reads the precomputed mv_pool_category_users (2,441 rows across all
 * categories), so this is a small indexed lookup rather than a live join over
 * pools + pool_participants, which measured 1.2-2.0s warm per category.
 */
export async function getPoolCategoryUsers(
  categorySlug: string,
  rowLimit = 500
): Promise<PoolCategoryUsersResult> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_pool_category_users", {
    target_category: categorySlug,
    row_limit: rowLimit,
  });
  if (error) {
    console.error("getPoolCategoryUsers failed:", error.message);
    return { users: [], totalCount: 0 };
  }
  if (!data) return { users: [], totalCount: 0 };
  const rows = data as PoolUserRow[];
  return {
    users: rows.map((r) => ({
      userId: r.user_id,
      userName: r.user_name,
      phone: r.phone,
      poolsCreated: toNum(r.pools_created) ?? 0,
      poolsJoined: toNum(r.pools_joined) ?? 0,
      lastActivityAt: r.last_activity_at,
      trustScore: r.trust_score,
      isVerified: r.is_verified,
    })),
    totalCount: toNum(rows[0]?.total_count) ?? 0,
  };
}
