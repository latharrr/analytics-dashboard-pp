import { getKpiSnapshot, getRefreshInfo } from "@/lib/db/kpi";
import { StatTileGrid } from "@/components/kpi/StatTile";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function AiCopilotPage() {
  const [aiCopilot, refreshInfo] = await Promise.all([getKpiSnapshot("mv_ai_copilot_kpis"), getRefreshInfo()]);

  return (
    <div>
      <KpiPageHeader
        title="AI / Copilot & Automation"
        description="Copilot chats and virtual-user/bot automation activity."
      />
      <StatTileGrid row={aiCopilot} asOf={refreshInfo?.refreshed_at} />
    </div>
  );
}
