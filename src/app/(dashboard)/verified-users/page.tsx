import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { VerifiedUsersView } from "@/components/verifiedUsers/VerifiedUsersView";

export default function VerifiedUsersPage() {
  return (
    <div>
      <KpiPageHeader
        title="Verified Users"
        description="Users verified via both Digilocker and college ID. Search by name/phone or college, filter by signup date, and export the filtered list directly. Bot accounts excluded."
      />
      <VerifiedUsersView />
    </div>
  );
}
