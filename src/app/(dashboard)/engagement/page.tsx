import { getKpiSnapshot, getRefreshInfo } from "@/lib/db/kpi";
import { getActivityByHour, getDauWauMau, getFeatureAdoption } from "@/lib/db/activityBreakdown";
import { StatTile } from "@/components/kpi/StatTile";
import { BarChartCard } from "@/components/kpi/BarChartCard";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function EngagementPage() {
  const liveAsOf = new Date().toISOString();

  const [dauWauMau, activityByHour, featureAdoption, chat, trust, refreshInfo] = await Promise.all([
    getDauWauMau(),
    getActivityByHour(),
    getFeatureAdoption(),
    getKpiSnapshot("mv_chat_kpis"),
    getKpiSnapshot("mv_trust_kpis"),
    getRefreshInfo(),
  ]);
  const mvAsOf = refreshInfo?.refreshed_at;

  return (
    <div>
      <KpiPageHeader
        title="Engagement"
        description="How actively people use the product once they're in. Activity/hour and feature adoption are proxies built from chat, trust, and pool actions, not a dedicated screen/session tracker."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Daily Active Users" value={dauWauMau.dau} asOf={liveAsOf} />
        <StatTile label="Weekly Active Users" value={dauWauMau.wau} asOf={liveAsOf} />
        <StatTile label="Monthly Active Users" value={dauWauMau.mau} asOf={liveAsOf} />
        <StatTile label="Avg Messages / Room" value={chat?.avg_messages_per_room} asOf={mvAsOf} />
        <StatTile label="Avg Trust Actions / User" value={trust?.avg_trust_actions_per_active_user} asOf={mvAsOf} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard
          title="Activity by hour of day (proxy, last 30 days)"
          data={activityByHour}
          valueLabel="events"
          asOf={liveAsOf}
        />
        <BarChartCard
          title="Feature adoption (last 30 days)"
          data={featureAdoption}
          valueLabel="active users"
          asOf={liveAsOf}
        />
      </div>
    </div>
  );
}
