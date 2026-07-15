import { getKpiSnapshot } from "@/lib/db/kpi";
import { StatTileGrid } from "@/components/kpi/StatTile";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function MatchingPage() {
  const matching = await getKpiSnapshot("mv_matching_kpis");

  return (
    <div>
      <KpiPageHeader
        title="Matching"
        description="Flatmate matching, lifestyle profiles, and tag affinity (newly tracked)."
      />
      <StatTileGrid row={matching} />
    </div>
  );
}
