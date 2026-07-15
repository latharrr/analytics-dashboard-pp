import { getKpiSnapshot, getRefreshInfo } from "@/lib/db/kpi";
import { StatTileGrid } from "@/components/kpi/StatTile";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function MatchingPage() {
  const [matching, refreshInfo] = await Promise.all([getKpiSnapshot("mv_matching_kpis"), getRefreshInfo()]);

  return (
    <div>
      <KpiPageHeader
        title="Matching"
        description="Flatmate matching, lifestyle profiles, and tag affinity (newly tracked)."
      />
      <StatTileGrid row={matching} asOf={refreshInfo?.refreshed_at} />
    </div>
  );
}
