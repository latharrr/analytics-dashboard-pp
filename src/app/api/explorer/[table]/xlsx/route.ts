import { NextRequest, NextResponse } from "next/server";
import { isExplorableTable, queryTable, toXlsxBuffer } from "@/lib/db/explorer";
import { getColumnTypesForTable } from "@/lib/db/schemaCache";
import { parseExportParams, parseLimitParam } from "@/lib/db/exportParams";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";

// Excel's own worksheet row limit is far higher, but this stays consistent
// with the CSV export's cap and keeps generation time bounded.
const XLSX_ROW_CAP = 10_000;

export const maxDuration = 30;

export async function GET(request: NextRequest, { params }: { params: { table: string } }) {
  const { table } = params;
  if (!isExplorableTable(table)) {
    return NextResponse.json({ error: "unknown table" }, { status: 404 });
  }

  const allowed = await checkRateLimit(getClientIp(request), {
    route: "explorer-xlsx",
    windowSeconds: 60,
    maxRequests: 10,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const { sortColumn, sortDir, filters, dateRange } = parseExportParams(request);
  const rowLimit = parseLimitParam(request, XLSX_ROW_CAP);
  const columnTypes = await getColumnTypesForTable(table);

  try {
    const { rows } = await queryTable(table, {
      page: 1,
      pageSize: rowLimit,
      sortColumn,
      sortDir,
      filters,
      columnTypes,
      dateRange,
    });

    const buffer = toXlsxBuffer(rows, table);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${table}.xlsx"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
