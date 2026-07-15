import { NextRequest, NextResponse } from "next/server";
import { isExplorableTable, queryTable } from "@/lib/db/explorer";
import { getColumnTypesForTable } from "@/lib/db/schemaCache";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";

const RESERVED_PARAMS = new Set(["page", "pageSize", "sort", "dir"]);

export async function GET(request: NextRequest, { params }: { params: { table: string } }) {
  const { table } = params;
  if (!isExplorableTable(table)) {
    return NextResponse.json({ error: "unknown table" }, { status: 404 });
  }

  const allowed = await checkRateLimit(getClientIp(request), {
    route: "explorer",
    windowSeconds: 60,
    maxRequests: 120,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? "50")));
  const sortColumn = searchParams.get("sort") ?? undefined;
  const sortDir = (searchParams.get("dir") as "asc" | "desc" | null) ?? undefined;

  const filters: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (!RESERVED_PARAMS.has(key)) filters[key] = value;
  }

  const columnTypes = await getColumnTypesForTable(table);

  try {
    const { rows, count } = await queryTable(table, {
      page,
      pageSize,
      sortColumn,
      sortDir,
      filters,
      columnTypes,
    });
    return NextResponse.json({ rows, count, page, pageSize, columns: Object.keys(columnTypes) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
