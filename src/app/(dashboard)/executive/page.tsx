import { getKpiSnapshot, getRefreshInfo } from "@/lib/db/kpi";
import { getDauWauMau } from "@/lib/db/activityBreakdown";
import { StatTile } from "@/components/kpi/StatTile";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function ExecutivePage() {
  const liveAsOf = new Date().toISOString();

  const [growth, pools, chat, trust, monetization, matching, aiCopilot, dauWauMau, refreshInfo] = await Promise.all([
    getKpiSnapshot("mv_growth_kpis"),
    getKpiSnapshot("mv_pool_kpis"),
    getKpiSnapshot("mv_chat_kpis"),
    getKpiSnapshot("mv_trust_kpis"),
    getKpiSnapshot("mv_monetization_kpis"),
    getKpiSnapshot("mv_matching_kpis"),
    getKpiSnapshot("mv_ai_copilot_kpis"),
    getDauWauMau(),
    getRefreshInfo(),
  ]);
  const mvAsOf = refreshInfo?.refreshed_at;

  return (
    <div>
      <KpiPageHeader
        title="Executive KPI"
        description="One headline number per module. Drill into the module tabs for detail."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="Daily Active Users" value={dauWauMau.dau} asOf={liveAsOf} />
        <StatTile label="Weekly Active Users" value={dauWauMau.wau} asOf={liveAsOf} />
        <StatTile label="Monthly Active Users" value={dauWauMau.mau} asOf={liveAsOf} />
        <StatTile label="Total Users" value={growth?.total_users} asOf={mvAsOf} />
        <StatTile label="New Users (30d)" value={growth?.new_users_last_30_days} asOf={mvAsOf} />
        <StatTile label="Total Pools" value={pools?.total_pools} asOf={mvAsOf} />
        <StatTile label="Pool Completion Rate %" value={pools?.overall_completion_rate_pct} asOf={mvAsOf} />
        <StatTile label="Total Chat Messages" value={chat?.total_messages} asOf={mvAsOf} />
        <StatTile label="Active Chat Memberships" value={chat?.active_memberships} asOf={mvAsOf} />
        <StatTile label="Total Trust Actions" value={trust?.total_trust_actions} asOf={mvAsOf} />
        <StatTile label="Avg Trust Actions / User" value={trust?.avg_trust_actions_per_active_user} asOf={mvAsOf} />
        <StatTile label="Paid Conversions" value={monetization?.paid_conversions} asOf={mvAsOf} />
        <StatTile label="Total Paid Amount" value={monetization?.total_paid_amount} asOf={mvAsOf} />
        <StatTile label="Matching Interactions" value={matching?.total_interactions} asOf={mvAsOf} />
        <StatTile label="Accepted Matches" value={matching?.accepted_interactions} asOf={mvAsOf} />
        <StatTile label="Copilot Chats" value={aiCopilot?.total_copilot_chats} asOf={mvAsOf} />
        <StatTile label="Active Virtual Users" value={aiCopilot?.active_virtual_users} asOf={mvAsOf} />
      </div>
    </div>
  );
}
