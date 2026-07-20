import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { NewUserLocationsView } from "@/components/newUserLocations/NewUserLocationsView";

export default function NewUserLocationsPage() {
  return (
    <div>
      <KpiPageHeader
        title="New User Locations"
        description="Users who signed up in the selected window, reverse-geocoded from the GPS coordinate they shared into a 'City, State', with contact info for follow-up. Location comes only from users who shared one — those who didn't show as 'No location captured' (a data-collection gap in the app, not a lookup failure); rows with a coordinate we haven't resolved yet show as 'Unknown location'. Bot accounts excluded."
      />
      <NewUserLocationsView />
    </div>
  );
}
