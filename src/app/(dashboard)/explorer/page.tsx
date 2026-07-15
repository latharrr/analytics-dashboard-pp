import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { DataTable } from "@/components/explorer/DataTable";

export default function ExplorerPage() {
  return (
    <div>
      <KpiPageHeader
        title="Data Explorer"
        description="Browse, filter, sort, and export any of the 79 tracked tables."
      />
      <DataTable />
    </div>
  );
}
