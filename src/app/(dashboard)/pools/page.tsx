import { getKpiSnapshot, getRefreshInfo } from "@/lib/db/kpi";
import {
  getPoolCompletionByCategory,
  getAskAroundEngagedUsers,
  getAskAroundCreatorVerification,
} from "@/lib/db/poolBreakdown";
import { StatTile, StatTileGrid } from "@/components/kpi/StatTile";
import { BarChartCard } from "@/components/kpi/BarChartCard";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { AskAroundByNewUsersCard } from "@/components/askAround/AskAroundByNewUsersCard";

export default async function PoolsPage() {
  const liveAsOf = new Date().toISOString();

  const [pools, refreshInfo, completionByCategory, askAroundEngaged, askAroundVerification] = await Promise.all([
    getKpiSnapshot("mv_pool_kpis"),
    getRefreshInfo(),
    getPoolCompletionByCategory(),
    getAskAroundEngagedUsers(),
    getAskAroundCreatorVerification(),
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

      <h2 className="mb-3 mt-6 text-sm font-semibold text-ink">Ask Around</h2>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Engaged users (all-time)" value={askAroundEngaged} asOf={liveAsOf} />
        <StatTile label="All-time creators" value={askAroundVerification.creators} asOf={liveAsOf} />
        <StatTile label="Verified: Digilocker only" value={askAroundVerification.digilockerOnly} asOf={liveAsOf} />
        <StatTile label="Verified: college ID only" value={askAroundVerification.collegeOnly} asOf={liveAsOf} />
        <StatTile label="Verified: both" value={askAroundVerification.both} asOf={liveAsOf} />
        <StatTile label="Verified: neither" value={askAroundVerification.neither} asOf={liveAsOf} />
      </div>
      <p className="mb-4 text-[11px] text-ink-muted/70">
        Bot accounts that also created one (excluded above): {askAroundVerification.botCreators.toLocaleString()}
      </p>
      <AskAroundByNewUsersCard />
    </div>
  );
}
