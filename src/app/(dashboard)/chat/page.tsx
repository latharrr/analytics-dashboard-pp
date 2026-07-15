import { getKpiSnapshot, getRefreshInfo } from "@/lib/db/kpi";
import { StatTileGrid } from "@/components/kpi/StatTile";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";

export default async function ChatPage() {
  const [chat, refreshInfo] = await Promise.all([getKpiSnapshot("mv_chat_kpis"), getRefreshInfo()]);

  return (
    <div>
      <KpiPageHeader title="Chat" description="Messaging activity across rooms, members, and requests." />
      <StatTileGrid row={chat} asOf={refreshInfo?.refreshed_at} />
    </div>
  );
}
