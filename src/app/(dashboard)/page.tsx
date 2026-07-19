import { getKpiSnapshot, getRefreshInfo } from "@/lib/db/kpi";
import { getTopCollegesByUsers } from "@/lib/db/growthBreakdown";
import {
  getActiveUsersByProximity,
  getActiveUsersPerDay,
  getActiveUsersTotal,
  getActivityByHour,
  getDauWauMau,
  getFeatureAdoption,
  getNewUsersPerDay,
} from "@/lib/db/activityBreakdown";
import { getNewUserLocationsSummary } from "@/lib/db/newUserLocations";
import { StatTile, StatTileGrid } from "@/components/kpi/StatTile";
import { BarChartCard } from "@/components/kpi/BarChartCard";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function OverviewPage() {
  const liveAsOf = new Date().toISOString();

  const [
    growth,
    refreshInfo,
    topColleges,
    dauWauMau,
    newUsersPerDay,
    activeUsersPerDay,
    activeUsersTotal14d,
    activityByHour,
    proximity,
    featureAdoption,
    newUserLocations,
  ] = await Promise.all([
    getKpiSnapshot("mv_growth_kpis"),
    getRefreshInfo(),
    getTopCollegesByUsers(5),
    getDauWauMau(),
    getNewUsersPerDay(14),
    getActiveUsersPerDay(14),
    getActiveUsersTotal(14),
    getActivityByHour(),
    getActiveUsersByProximity(),
    getFeatureAdoption(),
    getNewUserLocationsSummary(30),
  ]);
  const mvAsOf = refreshInfo?.refreshed_at;

  return (
    <div>
      <KpiPageHeader
        title="Overview"
        description="Growth KPIs and a cross-module summary. Materialized-view stats refresh nightly; DAU/WAU/MAU and the charts below are computed live."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Daily Active Users" value={dauWauMau.dau} asOf={liveAsOf} />
        <StatTile label="Weekly Active Users" value={dauWauMau.wau} asOf={liveAsOf} />
        <StatTile label="Monthly Active Users" value={dauWauMau.mau} asOf={liveAsOf} />
        <StatTile label="Unique active users (last 14 days)" value={activeUsersTotal14d} asOf={liveAsOf} />
      </div>

      <StatTileGrid row={growth} asOf={mvAsOf} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard
          title="New users per day (last 14 days)"
          data={newUsersPerDay}
          valueLabel="new users"
          asOf={liveAsOf}
        />
        <BarChartCard
          title="Active users per day (last 14 days, proxy)"
          data={activeUsersPerDay}
          valueLabel="active users"
          asOf={liveAsOf}
        />
        <BarChartCard
          title="Activity by hour of day (proxy, last 30 days)"
          data={activityByHour}
          valueLabel="events"
          asOf={liveAsOf}
        />
        <BarChartCard title="Top 5 colleges by users" data={topColleges} valueLabel="users" asOf={liveAsOf} />
        <BarChartCard
          title="Active users within 5km of a college (last 30 days)"
          data={proximity}
          valueLabel="active users"
          asOf={liveAsOf}
        />
        <BarChartCard
          title="Feature adoption (last 30 days)"
          data={featureAdoption}
          valueLabel="active users"
          asOf={liveAsOf}
        />
        <BarChartCard
          title="New users by location (last 30 days)"
          data={newUserLocations}
          valueLabel="new users"
          asOf={liveAsOf}
        />
      </div>
    </div>
  );
}
