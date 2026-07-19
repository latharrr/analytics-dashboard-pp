import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { NewUserLocationsView } from "@/components/newUserLocations/NewUserLocationsView";

export default function NewUserLocationsPage() {
  return (
    <div>
      <KpiPageHeader
        title="New User Locations"
        description="Users who signed up in the selected window, mapped to their nearest college (within 5km) with contact info for follow-up. Users with no location on file or no college nearby show as 'Unknown / no college nearby'. Bot accounts excluded."
      />
      <NewUserLocationsView />
    </div>
  );
}
