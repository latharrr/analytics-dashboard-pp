import { getKpiSnapshot, getRefreshInfo } from "@/lib/db/kpi";
import { StatTileGrid } from "@/components/kpi/StatTile";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function TrustPage() {
  const [trust, refreshInfo] = await Promise.all([getKpiSnapshot("mv_trust_kpis"), getRefreshInfo()]);

  return (
    <div>
      <KpiPageHeader title="Trust & Verification" description="Trust ledger activity, KYC gates, and Digilocker linkage." />
      <StatTileGrid row={trust} asOf={refreshInfo?.refreshed_at} />
    </div>
  );
}
