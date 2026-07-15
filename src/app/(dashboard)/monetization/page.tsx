import { getKpiSnapshot, getRefreshInfo } from "@/lib/db/kpi";
import { StatTileGrid } from "@/components/kpi/StatTile";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function MonetizationPage() {
  const [monetization, refreshInfo] = await Promise.all([
    getKpiSnapshot("mv_monetization_kpis"),
    getRefreshInfo(),
  ]);

  return (
    <div>
      <KpiPageHeader
        title="Monetization"
        description="Rental referral clicks, conversions, attributions, and flat leads."
      />
      <StatTileGrid row={monetization} asOf={refreshInfo?.refreshed_at} />
    </div>
  );
}
