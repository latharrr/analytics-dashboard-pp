import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { PgFlatLeadsView } from "@/components/pgFlatLeads/PgFlatLeadsView";

export default function PgFlatLeadsPage() {
  return (
    <div>
      <KpiPageHeader
        title="PG / Flat Leads"
        description="Users who submitted a PG search, created a Flat listing, or created a Flatmate listing, with contact info for follow-up. No tap/click tracking exists in this data — these are the closest real intent signals available (an actual search or listing, not a tab tap). Bot accounts excluded."
      />
      <PgFlatLeadsView />
    </div>
  );
}
