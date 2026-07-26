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
