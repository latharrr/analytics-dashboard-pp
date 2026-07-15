import { getKpiSnapshot } from "@/lib/db/kpi";
import { getTopCollegesByUsers } from "@/lib/db/growthBreakdown";
import {
  getActiveUsersByProximity,
  getActiveUsersPerDay,
  getActivityByHour,
  getDauWauMau,
  getFeatureAdoption,
  getNewUsersPerDay,
} from "@/lib/db/activityBreakdown";
import { StatTile, StatTileGrid } from "@/components/kpi/StatTile";
import { BarChartCard } from "@/components/kpi/BarChartCard";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function OverviewPage() {
  const [
    growth,
    topColleges,
    dauWauMau,
    newUsersPerDay,
    activeUsersPerDay,
    activityByHour,
    proximity,
    featureAdoption,
  ] = await Promise.all([
    getKpiSnapshot("mv_growth_kpis"),
    getTopCollegesByUsers(5),
    getDauWauMau(),
    getNewUsersPerDay(14),
    getActiveUsersPerDay(14),
    getActivityByHour(),
    getActiveUsersByProximity(),
    getFeatureAdoption(),
  ]);

  return (
    <div>
      <KpiPageHeader
        title="Overview"
        description="Growth KPIs and a cross-module summary. Materialized-view stats refresh nightly; DAU/WAU/MAU and the charts below are computed live."
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatTile label="Daily Active Users" value={dauWauMau.dau} />
        <StatTile label="Weekly Active Users" value={dauWauMau.wau} />
        <StatTile label="Monthly Active Users" value={dauWauMau.mau} />
      </div>

      <StatTileGrid row={growth} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard title="New users per day (last 14 days)" data={newUsersPerDay} valueLabel="new users" />
        <BarChartCard
          title="Active users per day (last 14 days, proxy)"
          data={activeUsersPerDay}
          valueLabel="active users"
        />
        <BarChartCard title="Activity by hour of day (proxy, last 30 days)" data={activityByHour} valueLabel="events" />
        <BarChartCard title="Top 5 colleges by users" data={topColleges} valueLabel="users" />
        <BarChartCard
          title="Active users within 5km of a college (last 30 days)"
          data={proximity}
          valueLabel="active users"
        />
        <BarChartCard title="Feature adoption (last 30 days)" data={featureAdoption} valueLabel="active users" />
      </div>
    </div>
  );
}
