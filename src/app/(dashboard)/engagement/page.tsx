import { getKpiSnapshot } from "@/lib/db/kpi";
import { getActivityByHour, getDauWauMau, getFeatureAdoption } from "@/lib/db/activityBreakdown";
import { StatTile } from "@/components/kpi/StatTile";
import { BarChartCard } from "@/components/kpi/BarChartCard";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function EngagementPage() {
  const [dauWauMau, activityByHour, featureAdoption, chat, trust] = await Promise.all([
    getDauWauMau(),
    getActivityByHour(),
    getFeatureAdoption(),
    getKpiSnapshot("mv_chat_kpis"),
    getKpiSnapshot("mv_trust_kpis"),
  ]);

  return (
    <div>
      <KpiPageHeader
        title="Engagement"
        description="How actively people use the product once they're in. Activity/hour and feature adoption are proxies built from chat, trust, and pool actions, not a dedicated screen/session tracker."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Daily Active Users" value={dauWauMau.dau} />
        <StatTile label="Weekly Active Users" value={dauWauMau.wau} />
        <StatTile label="Monthly Active Users" value={dauWauMau.mau} />
        <StatTile label="Avg Messages / Room" value={chat?.avg_messages_per_room} />
        <StatTile label="Avg Trust Actions / User" value={trust?.avg_trust_actions_per_active_user} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard title="Activity by hour of day (proxy, last 30 days)" data={activityByHour} valueLabel="events" />
        <BarChartCard title="Feature adoption (last 30 days)" data={featureAdoption} valueLabel="active users" />
      </div>
    </div>
  );
}
