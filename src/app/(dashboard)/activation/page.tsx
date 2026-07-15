import { getActivationFunnel } from "@/lib/db/activityBreakdown";
import { getKpiSnapshot } from "@/lib/db/kpi";
import { StatTile } from "@/components/kpi/StatTile";
import { BarChartCard } from "@/components/kpi/BarChartCard";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function ActivationPage() {
  const [funnel, growth, trust] = await Promise.all([
    getActivationFunnel(),
    getKpiSnapshot("mv_growth_kpis"),
    getKpiSnapshot("mv_trust_kpis"),
  ]);

  return (
    <div>
      <KpiPageHeader
        title="Activation"
        description="What new users (last 30 days) actually do after signing up. Verified/joined-a-pool/sent-a-message is a proxy funnel, not a dedicated onboarding-event log."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="New Users (30d)" value={growth?.new_users_last_30_days} />
        <StatTile label="Verified Users" value={growth?.verified_users} />
        <StatTile label="KYC Required Actions" value={trust?.kyc_required_actions} />
      </div>
      <BarChartCard title="Signup-to-first-action funnel (last 30 days)" data={funnel} valueLabel="users" />
    </div>
  );
}
