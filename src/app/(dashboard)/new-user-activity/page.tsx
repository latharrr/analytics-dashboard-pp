import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { NewUserActivityView } from "@/components/newUserActivity/NewUserActivityView";

export default function NewUserActivityPage() {
  return (
    <div>
      <KpiPageHeader
        title="New User Activity"
        description="Users who signed up in the selected window, what they did (joined/created a pool, PG search, flat/flatmate listing, trust action), and when, with phone numbers for follow-up. Live, bot accounts excluded."
      />
      <NewUserActivityView />
    </div>
  );
}
