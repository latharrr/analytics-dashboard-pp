import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { AllUsersView } from "@/components/allUsers/AllUsersView";

export default function AllUsersPage() {
  return (
    <div>
      <KpiPageHeader
        title="All Users"
        description="Every user in the app: signup ('installed') date, last visit, and their most recent tracked activity. Filter by signup date, last-active date, or name/phone, sort any column, and export directly to CSV or a spreadsheet. Bot accounts excluded."
      />
      <AllUsersView />
    </div>
  );
}
