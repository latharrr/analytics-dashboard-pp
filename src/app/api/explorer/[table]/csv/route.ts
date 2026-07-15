import { NextRequest, NextResponse } from "next/server";
import { isExplorableTable, queryTable, toCsv } from "@/lib/db/explorer";
import { getColumnTypesForTable } from "@/lib/db/schemaCache";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";

const CSV_ROW_CAP = 10_000;
const RESERVED_PARAMS = new Set(["sort", "dir"]);

export const maxDuration = 30;

export async function GET(request: NextRequest, { params }: { params: { table: string } }) {
  const { table } = params;
  if (!isExplorableTable(table)) {
    return NextResponse.json({ error: "unknown table" }, { status: 404 });
  }

  const allowed = await checkRateLimit(getClientIp(request), {
    route: "explorer-csv",
    windowSeconds: 60,
    maxRequests: 10,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const searchParams = request.nextUrl.searchParams;
  const sortColumn = searchParams.get("sort") ?? undefined;
  const sortDir = (searchParams.get("dir") as "asc" | "desc" | null) ?? undefined;

  const filters: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (!RESERVED_PARAMS.has(key)) filters[key] = value;
  }

  const columnTypes = await getColumnTypesForTable(table);

  try {
    const { rows } = await queryTable(table, {
      page: 1,
      pageSize: CSV_ROW_CAP,
      sortColumn,
      sortDir,
      filters,
      columnTypes,
    });

    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${table}.csv"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
