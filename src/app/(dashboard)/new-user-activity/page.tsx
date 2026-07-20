import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { NewUserActivityView } from "@/components/newUserActivity/NewUserActivityView";

export default function NewUserActivityPage() {
  return (
    <div>
      <KpiPageHeader
        title="New User Activity"
        description="Users who signed up in the last selected number of days — a rolling window, not calendar weeks, so counts here won't line up with Retention's weekly cohorts. Shows what each did (joined/created a pool, PG search, flat/flatmate listing, trust action) and when, with phone numbers for follow-up. The tiles count all signups and distinct users per action; the table below lists only the users who did at least one activity. Live, bot accounts excluded."
      />
      <NewUserActivityView />
    </div>
  );
}
