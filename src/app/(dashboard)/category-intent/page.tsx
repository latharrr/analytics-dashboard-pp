import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { CategoryIntentView } from "@/components/categoryIntent/CategoryIntentView";

export default function CategoryIntentPage() {
  return (
    <div>
      <KpiPageHeader
        title="Category Intent"
        description="What users are actually looking at, by content category. Views, pool joins, likes and dwell time from the app's per-tag affinity counters, rolled up to each tag's category, with the most-viewed tags inside each. Click through to the users behind any category. Bot accounts excluded."
      />
      <CategoryIntentView />
    </div>
  );
}
