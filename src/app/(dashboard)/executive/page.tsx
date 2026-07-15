import { getKpiSnapshot } from "@/lib/db/kpi";
import { getDauWauMau } from "@/lib/db/activityBreakdown";
import { StatTile } from "@/components/kpi/StatTile";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function ExecutivePage() {
  const [growth, pools, chat, trust, monetization, matching, aiCopilot, dauWauMau] = await Promise.all([
    getKpiSnapshot("mv_growth_kpis"),
    getKpiSnapshot("mv_pool_kpis"),
    getKpiSnapshot("mv_chat_kpis"),
    getKpiSnapshot("mv_trust_kpis"),
    getKpiSnapshot("mv_monetization_kpis"),
    getKpiSnapshot("mv_matching_kpis"),
    getKpiSnapshot("mv_ai_copilot_kpis"),
    getDauWauMau(),
  ]);

  return (
    <div>
      <KpiPageHeader
        title="Executive KPI"
        description="One headline number per module. Drill into the module tabs for detail."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="Daily Active Users" value={dauWauMau.dau} />
        <StatTile label="Weekly Active Users" value={dauWauMau.wau} />
        <StatTile label="Monthly Active Users" value={dauWauMau.mau} />
        <StatTile label="Total Users" value={growth?.total_users} />
        <StatTile label="New Users (30d)" value={growth?.new_users_last_30_days} />
        <StatTile label="Total Pools" value={pools?.total_pools} />
        <StatTile label="Pool Completion Rate %" value={pools?.overall_completion_rate_pct} />
        <StatTile label="Total Chat Messages" value={chat?.total_messages} />
        <StatTile label="Active Chat Memberships" value={chat?.active_memberships} />
        <StatTile label="Total Trust Actions" value={trust?.total_trust_actions} />
        <StatTile label="Avg Trust Actions / User" value={trust?.avg_trust_actions_per_active_user} />
        <StatTile label="Paid Conversions" value={monetization?.paid_conversions} />
        <StatTile label="Total Paid Amount" value={monetization?.total_paid_amount} />
        <StatTile label="Matching Interactions" value={matching?.total_interactions} />
        <StatTile label="Accepted Matches" value={matching?.accepted_interactions} />
        <StatTile label="Copilot Chats" value={aiCopilot?.total_copilot_chats} />
        <StatTile label="Active Virtual Users" value={aiCopilot?.active_virtual_users} />
      </div>
    </div>
  );
}
