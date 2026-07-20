import { getServiceClient } from "@/lib/supabase/server";

export interface VerifiedUser {
  userId: string;
  userName: string | null;
  phone: string | null;
  collegeName: string | null;
  trustScore: number | null;
  signedUpAt: string;
  lastActivity: string | null;
  digilockerVerifiedAt: string | null;
  collegeVerifiedAt: string | null;
}

export interface VerifiedUsersResult {
  users: VerifiedUser[];
  totalCount: number;
}

export interface VerifiedUsersFilters {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  college?: string;
}

interface DetailRow {
  user_id: string;
  user_name: string | null;
  phone: string | null;
  college_name: string | null;
  trust_score: number | null;
  signed_up_at: string;
  last_activity: string | null;
  digilocker_verified_at: string | null;
  college_verified_at: string | null;
  total_count: number;
}

/**
 * Users verified via both Digilocker and college ID. Backed by
 * analytics_verified_users_detail() (migration 029), which applies all
 * filters in SQL so the dashboard view and its CSV export always agree.
 */
export async function getVerifiedUsers(
  filters: VerifiedUsersFilters,
  rowLimit = 500
): Promise<VerifiedUsersResult> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_verified_users_detail", {
    date_from: filters.dateFrom ?? null,
    date_to: filters.dateTo ?? null,
    search_text: filters.search ?? null,
    college_search: filters.college ?? null,
    row_limit: rowLimit,
  });
  if (error || !data) return { users: [], totalCount: 0 };

  const rows = data as DetailRow[];
  return {
    users: rows.map((r) => ({
      userId: r.user_id,
      userName: r.user_name,
      phone: r.phone,
      collegeName: r.college_name,
      trustScore: r.trust_score,
      signedUpAt: r.signed_up_at,
      lastActivity: r.last_activity,
      digilockerVerifiedAt: r.digilocker_verified_at,
      collegeVerifiedAt: r.college_verified_at,
    })),
    totalCount: rows[0]?.total_count ?? 0,
  };
}
