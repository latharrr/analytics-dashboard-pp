import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { ChatPanel } from "@/components/ai-query/ChatPanel";

export default function AiQueryPage() {
  return (
    <div>
      <KpiPageHeader
        title="AI Query"
        description="Ask a plain-English question. Answers are generated from live SQL and always cited."
      />
      <ChatPanel />
    </div>
  );
}
