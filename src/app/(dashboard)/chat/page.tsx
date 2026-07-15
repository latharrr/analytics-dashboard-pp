import { getKpiSnapshot } from "@/lib/db/kpi";
import { StatTileGrid } from "@/components/kpi/StatTile";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function ChatPage() {
  const chat = await getKpiSnapshot("mv_chat_kpis");

  return (
    <div>
      <KpiPageHeader title="Chat" description="Messaging activity across rooms, members, and requests." />
      <StatTileGrid row={chat} />
    </div>
  );
}
