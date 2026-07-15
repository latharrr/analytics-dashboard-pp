import { getKpiSnapshot } from "@/lib/db/kpi";
import { getPoolCompletionByCategory } from "@/lib/db/poolBreakdown";
import { StatTileGrid } from "@/components/kpi/StatTile";
import { BarChartCard } from "@/components/kpi/BarChartCard";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function PoolsPage() {
  const [pools, completionByCategory] = await Promise.all([
    getKpiSnapshot("mv_pool_kpis"),
    getPoolCompletionByCategory(),
  ]);

  return (
    <div>
      <KpiPageHeader title="Pools" description="Pool creation, participation, and completion metrics." />
      <StatTileGrid row={pools} />
      <div className="mt-4">
        <BarChartCard
          title="Completion rate by pool type (%)"
          data={completionByCategory}
          valueLabel="completion rate"
        />
      </div>
    </div>
  );
}
