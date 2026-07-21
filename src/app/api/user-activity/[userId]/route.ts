import { NextRequest, NextResponse } from "next/server";
import { getUserActivityDetail } from "@/lib/db/allUsers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One user's full tracked-activity timeline (all-time) — powers expand-on-demand rows. */
export async function GET(_request: NextRequest, { params }: { params: { userId: string } }) {
  const userId = params.userId;
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }
  const events = await getUserActivityDetail(userId);
  return NextResponse.json({ userId, events });
}
