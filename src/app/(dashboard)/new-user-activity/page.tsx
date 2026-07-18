import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { NewUserActivityView } from "@/components/newUserActivity/NewUserActivityView";

export default function NewUserActivityPage() {
  return (
    <div>
      <KpiPageHeader
        title="New User Activity"
        description="Users who signed up in the selected window, what they did (chat, joined a pool, created a pool, trust action), and when. Live, bot accounts excluded."
      />
      <NewUserActivityView />
    </div>
  );
}
