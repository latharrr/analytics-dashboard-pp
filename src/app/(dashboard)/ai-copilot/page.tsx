import { getKpiSnapshot } from "@/lib/db/kpi";
import { StatTileGrid } from "@/components/kpi/StatTile";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function AiCopilotPage() {
  const aiCopilot = await getKpiSnapshot("mv_ai_copilot_kpis");

  return (
    <div>
      <KpiPageHeader
        title="AI / Copilot & Automation"
        description="Copilot chats and virtual-user/bot automation activity."
      />
      <StatTileGrid row={aiCopilot} />
    </div>
  );
}
