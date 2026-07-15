import { getKpiSnapshot } from "@/lib/db/kpi";
import { getTopCollegesByUsers } from "@/lib/db/growthBreakdown";
import { StatTileGrid } from "@/components/kpi/StatTile";
import { BarChartCard } from "@/components/kpi/BarChartCard";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function OverviewPage() {
  const [growth, topColleges] = await Promise.all([
    getKpiSnapshot("mv_growth_kpis"),
    getTopCollegesByUsers(5),
  ]);

  return (
    <div>
      <KpiPageHeader
        title="Overview"
        description="Growth KPIs and a cross-module summary, refreshed nightly."
      />
      <StatTileGrid row={growth} />
      <div className="mt-4">
        <BarChartCard title="Top 5 colleges by users" data={topColleges} valueLabel="users" />
      </div>
    </div>
  );
}
