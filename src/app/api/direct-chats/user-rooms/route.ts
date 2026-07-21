import { NextRequest, NextResponse } from "next/server";
import { getChatUserRooms } from "@/lib/db/directChats";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The rooms/pools a user has chatted in — for the Direct Chats "By user" drill-down. */
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Provide a valid userId." }, { status: 400 });
  }
  const rooms = await getChatUserRooms(userId);
  return NextResponse.json({ rooms });
}
