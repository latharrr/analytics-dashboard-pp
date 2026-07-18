import { getServiceClient } from "@/lib/supabase/server";
import type { BarDatum } from "@/components/kpi/BarChartCard";

/** Completion rate (% of pools with status='closed') per category. Aggregated in JS (pools is a small table). The raw table holds duplicate import snapshots of each pool, so rows are deduplicated by id first, keeping the freshest snapshot's status. */
export async function getPoolCompletionByCategory(): Promise<BarDatum[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("pools").select("id, category, status, updated_at");
  if (error || !data) return [];

  const latest = new Map<string, { category: string; status: string; updated_at: string | null }>();
  for (const row of data as { id: string; category: string; status: string; updated_at: string | null }[]) {
    const prev = latest.get(row.id);
    if (!prev || (row.updated_at ?? "") > (prev.updated_at ?? "")) {
      latest.set(row.id, row);
    }
  }

  const totals = new Map<string, { total: number; closed: number }>();
  for (const row of latest.values()) {
    const entry = totals.get(row.category) ?? { total: 0, closed: 0 };
    entry.total += 1;
    if (row.status === "closed") entry.closed += 1;
    totals.set(row.category, entry);
  }

  return Array.from(totals.entries())
    .map(([label, { total, closed }]) => ({
      label,
      value: total > 0 ? Math.round((closed / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.value - a.value);
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
