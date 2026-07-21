import { NextRequest, NextResponse } from "next/server";
import { getChatRoomMessages, getChatUserMessages } from "@/lib/db/directChats";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 100;

/** Expand-on-demand message timeline for one room (?roomId=) or one user (?userId=). */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const roomId = params.get("roomId");
  const userId = params.get("userId");

  if (roomId && UUID_RE.test(roomId)) {
    const { rows, totalCount } = await getChatRoomMessages(roomId, page, PAGE_SIZE);
    return NextResponse.json({ rows, totalCount, page, pageSize: PAGE_SIZE });
  }
  if (userId && UUID_RE.test(userId)) {
    const { rows, totalCount } = await getChatUserMessages(userId, page, PAGE_SIZE);
    return NextResponse.json({ rows, totalCount, page, pageSize: PAGE_SIZE });
  }
  return NextResponse.json({ error: "Provide a valid roomId or userId." }, { status: 400 });
}
