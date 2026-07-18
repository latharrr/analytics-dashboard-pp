import { getServiceClient } from "@/lib/supabase/server";
import type { BarDatum } from "@/components/kpi/BarChartCard";

export interface PgFlatLead {
  userId: string;
  userName: string | null;
  phone: string | null;
  activityType: string;
  occurredAt: string;
  detail: string | null;
}

export interface PgFlatLeadsResult {
  leads: PgFlatLead[];
  totalCount: number;
}

/**
 * Users who submitted a PG search, created a Flat listing, or created a
 * Flatmate listing — the closest real signals to "PG/Flat intent" that
 * exist (no tap/click tracking exists anywhere in this data; see
 * migration 025). Bot accounts excluded.
 */
export async function getPgFlatLeads(
  dateFrom?: string,
  dateTo?: string,
  rowLimit = 1000
): Promise<PgFlatLeadsResult> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_pg_flat_leads", {
    date_from: dateFrom ?? null,
    date_to: dateTo ?? null,
    row_limit: rowLimit,
  });
  if (error || !data) return { leads: [], totalCount: 0 };
  const rows = data as {
    user_id: string;
    user_name: string | null;
    phone: string | null;
    activity_type: string;
    occurred_at: string;
    detail: string | null;
    total_count: number;
  }[];
  return {
    leads: rows.map((r) => ({
      userId: r.user_id,
      userName: r.user_name,
      phone: r.phone,
      activityType: r.activity_type,
      occurredAt: r.occurred_at,
      detail: r.detail,
    })),
    totalCount: rows[0]?.total_count ?? 0,
  };
}

/** Aggregate counts only (no names/phones) — safe to send to Telegram. */
export async function getPgFlatLeadsSummary(daysBack: number): Promise<BarDatum[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_pg_flat_leads_summary", { days_back: daysBack });
  if (error || !data) return [];
  return (data as { activity_type: string; lead_count: number }[]).map((r) => ({
    label: r.activity_type,
    value: r.lead_count,
  }));
}
