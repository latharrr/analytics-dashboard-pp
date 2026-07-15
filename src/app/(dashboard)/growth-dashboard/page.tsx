import { getKpiSnapshot } from "@/lib/db/kpi";
import { getTopCollegesByUsers } from "@/lib/db/growthBreakdown";
import { getNewUsersPerDay } from "@/lib/db/activityBreakdown";
import { StatTileGrid } from "@/components/kpi/StatTile";
import { BarChartCard } from "@/components/kpi/BarChartCard";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function GrowthDashboardPage() {
  const [growth, newUsersPerDay, topColleges] = await Promise.all([
    getKpiSnapshot("mv_growth_kpis"),
    getNewUsersPerDay(30),
    getTopCollegesByUsers(5),
  ]);

  return (
    <div>
      <KpiPageHeader
        title="Growth"
        description="Signups, verification, and where new users are coming from."
      />
      <StatTileGrid row={growth} />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard title="New users per day (last 30 days)" data={newUsersPerDay} valueLabel="new users" />
        <BarChartCard title="Top 5 colleges by users" data={topColleges} valueLabel="users" />
      </div>
    </div>
  );
}
