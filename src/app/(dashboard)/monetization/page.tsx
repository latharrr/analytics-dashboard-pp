import { getKpiSnapshot } from "@/lib/db/kpi";
import { StatTileGrid } from "@/components/kpi/StatTile";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function MonetizationPage() {
  const monetization = await getKpiSnapshot("mv_monetization_kpis");

  return (
    <div>
      <KpiPageHeader
        title="Monetization"
        description="Rental referral clicks, conversions, attributions, and flat leads."
      />
      <StatTileGrid row={monetization} />
    </div>
  );
}
