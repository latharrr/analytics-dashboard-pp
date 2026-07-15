import { getKpiSnapshot, getRefreshInfo } from "@/lib/db/kpi";
import { getPoolCompletionByCategory } from "@/lib/db/poolBreakdown";
import { StatTileGrid } from "@/components/kpi/StatTile";
import { BarChartCard } from "@/components/kpi/BarChartCard";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function PoolsPage() {
  const liveAsOf = new Date().toISOString();

  const [pools, refreshInfo, completionByCategory] = await Promise.all([
    getKpiSnapshot("mv_pool_kpis"),
    getRefreshInfo(),
    getPoolCompletionByCategory(),
  ]);

  return (
    <div>
      <KpiPageHeader title="Pools" description="Pool creation, participation, and completion metrics." />
      <StatTileGrid row={pools} asOf={refreshInfo?.refreshed_at} />
      <div className="mt-4">
        <BarChartCard
          title="Completion rate by pool type (%)"
          data={completionByCategory}
          valueLabel="completion rate"
          asOf={liveAsOf}
        />
      </div>
    </div>
  );
}
