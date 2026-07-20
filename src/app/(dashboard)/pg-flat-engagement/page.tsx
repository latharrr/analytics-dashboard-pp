import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { PgFlatEngagementView } from "@/components/pgFlatEngagement/PgFlatEngagementView";

export default function PgFlatEngagementPage() {
  return (
    <div>
      <KpiPageHeader
        title="PG / Flat / Flatmate by User"
        description="Same source as PG / Flat Leads, grouped per user instead of per event — click a user to see everything they did. No page-visit or time-spent tracking exists anywhere in this data (no app has that instrumented here); these are the closest real signals: a PG search submitted, a Flat listing created, a Flatmate listing created. Bot accounts excluded."
      />
      <PgFlatEngagementView />
    </div>
  );
}
