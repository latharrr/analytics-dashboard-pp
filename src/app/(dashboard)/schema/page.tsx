import { getSchemaCache } from "@/lib/db/schemaCache";
import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { SchemaBrowser } from "@/components/schema/SchemaBrowser";

export default async function SchemaPage() {
  const cache = await getSchemaCache();

  return (
    <div>
      <KpiPageHeader
        title="Schema Browser"
        description="All 79 tables. Search by table or column name."
      />
      <SchemaBrowser cache={cache} />
    </div>
  );
}
