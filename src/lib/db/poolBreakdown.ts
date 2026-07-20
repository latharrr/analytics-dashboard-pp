import { getServiceClient } from "@/lib/supabase/server";
import type { BarDatum } from "@/components/kpi/BarChartCard";

/**
 * Completion rate (% of pools with status='closed') per category. Deduped and
 * aggregated in SQL via analytics_pool_completion_by_category() (migration 037)
 * over dedup.pools. The previous JS implementation read the raw public.pools
 * table with a bare `.select()`, which this project's REST "Max rows = 1000"
 * default silently truncated — and since the raw table holds ~3x duplicate
 * snapshots, it clipped to the first ~330 distinct pools and skewed every
 * category's rate once the app grew past that.
 */
export async function getPoolCompletionByCategory(): Promise<BarDatum[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_pool_completion_by_category");
  if (error) {
    console.error("getPoolCompletionByCategory failed:", error.message);
    return [];
  }
  if (!data) return [];
  return (data as { category: string; completion_rate_pct: number | null }[]).map((r) => ({
    label: r.category,
    value: r.completion_rate_pct ?? 0,
  }));
}

/**
 * Distinct users who have engaged with the "Ask Around" pool category
 * (pools.category = 'ask_around'), either by creating one or by joining
 * someone else's. All-time, bot accounts excluded. Backed by
 * analytics_ask_around_users() (migration 021).
 */
export async function getAskAroundEngagedUsers(): Promise<number> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_ask_around_users");
  if (error || data == null) return 0;
  return data as number;
}

/** Digilocker-only / college-ID-only / both / neither, for a set of Ask Around creators, plus a separate bot-creator count (bots stay excluded from the human breakdown itself). */
export interface VerificationBreakdown {
  digilockerOnly: number;
  collegeOnly: number;
  both: number;
  neither: number;
  botCreators: number;
}

export interface AskAroundByNewUsers extends VerificationBreakdown {
  newUsers: number;
  askAroundCreators: number;
}

/**
 * Of users who signed up in the last daysBack days ("new users"), how many
 * have created at least one Ask Around pool, and how are those creators
 * verified. Backed by analytics_ask_around_by_new_users() (migration 023).
 */
export async function getAskAroundByNewUsers(daysBack: number): Promise<AskAroundByNewUsers> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_ask_around_by_new_users", { days_back: daysBack });
  const empty: AskAroundByNewUsers = {
    newUsers: 0,
    askAroundCreators: 0,
    digilockerOnly: 0,
    collegeOnly: 0,
    both: 0,
    neither: 0,
    botCreators: 0,
  };
  if (error || !data) return empty;
  const row = (
    data as {
      new_users: number;
      ask_around_creators: number;
      verified_digilocker_only: number;
      verified_college_only: number;
      verified_both: number;
      verified_neither: number;
      bot_ask_around_creators: number;
    }[]
  )[0];
  if (!row) return empty;
  return {
    newUsers: row.new_users ?? 0,
    askAroundCreators: row.ask_around_creators ?? 0,
    digilockerOnly: row.verified_digilocker_only ?? 0,
    collegeOnly: row.verified_college_only ?? 0,
    both: row.verified_both ?? 0,
    neither: row.verified_neither ?? 0,
    botCreators: row.bot_ask_around_creators ?? 0,
  };
}

export interface AskAroundCreatorVerification extends VerificationBreakdown {
  creators: number;
}

/**
 * All-time verification breakdown for every user who has ever created an
 * Ask Around pool. Backed by analytics_ask_around_creator_verification()
 * (migration 023).
 */
export async function getAskAroundCreatorVerification(): Promise<AskAroundCreatorVerification> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_ask_around_creator_verification");
  const empty: AskAroundCreatorVerification = {
    creators: 0,
    digilockerOnly: 0,
    collegeOnly: 0,
    both: 0,
    neither: 0,
    botCreators: 0,
  };
  if (error || !data) return empty;
  const row = (
    data as {
      creators: number;
      verified_digilocker_only: number;
      verified_college_only: number;
      verified_both: number;
      verified_neither: number;
      bot_creators: number;
    }[]
  )[0];
  if (!row) return empty;
  return {
    creators: row.creators ?? 0,
    digilockerOnly: row.verified_digilocker_only ?? 0,
    collegeOnly: row.verified_college_only ?? 0,
    both: row.verified_both ?? 0,
    neither: row.verified_neither ?? 0,
    botCreators: row.bot_creators ?? 0,
  };
}
