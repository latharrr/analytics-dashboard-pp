import { NextRequest, NextResponse } from "next/server";
import {
  getChatConversationsForExport,
  getChatUsersForExport,
  type ChatRoomKind,
  type ChatSortDir,
} from "@/lib/db/directChats";
import { toCsv } from "@/lib/db/explorer";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";

const ROW_CAP = 10_000;
const ALLOWED_KINDS: ChatRoomKind[] = ["all", "dm", "pool"];

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  // Contains names + phone numbers, so this uses the stricter PII limit.
  const allowed = await checkRateLimit(getClientIp(request), {
    route: "direct-chats-csv",
    windowSeconds: 60,
    maxRequests: 5,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const params = request.nextUrl.searchParams;
  const view = params.get("view") === "user" ? "user" : "conversation";
  const kindParam = params.get("roomKind") as ChatRoomKind | null;
  const roomKind: ChatRoomKind = kindParam && ALLOWED_KINDS.includes(kindParam) ? kindParam : "all";
  const sortDir: ChatSortDir = params.get("sortDir") === "asc" ? "asc" : "desc";
  const search = params.get("search") || undefined;
  const dateFrom = params.get("dateFrom") || undefined;
  const dateTo = params.get("dateTo") || undefined;

  if (view === "user") {
    const sortByParam = params.get("sortBy");
    const sortBy = sortByParam === "signed_up" || sortByParam === "messages" ? sortByParam : "recent";
    const users = await getChatUsersForExport({ search, roomKind, dateFrom, dateTo, sortBy, sortDir }, ROW_CAP);
    const csv = toCsv(
      users.map((u) => ({
        name: u.userName,
        phone: u.phone,
        signed_up_at: u.signedUpAt,
        dm_messages: u.dmMsgCount,
        pool_messages: u.poolMsgCount,
        total_messages: u.totalMsgs,
        first_message_at: u.firstMessageAt,
        last_message_at: u.lastMessageAt,
        user_id: u.userId,
      }))
    );
    return csvResponse(csv, `direct-chats-users-${roomKind}.csv`);
  }

  const sortByParam = params.get("sortBy");
  const sortBy = sortByParam === "messages" ? "messages" : "recent";
  const convos = await getChatConversationsForExport({ search, roomKind, dateFrom, dateTo, sortBy, sortDir }, ROW_CAP);
  const csv = toCsv(
    convos.map((c) => ({
      room_kind: c.roomKind,
      label: c.label,
      participants: c.participants.map((p) => `${p.name ?? "?"} (${p.phone ?? "no phone"})`).join("; "),
      participant_count: c.participantCount,
      message_count: c.messageCount,
      first_message_at: c.firstMessageAt,
      last_message_at: c.lastMessageAt,
      room_id: c.roomId,
    }))
  );
  return csvResponse(csv, `direct-chats-conversations-${roomKind}.csv`);
}

function csvResponse(csv: string, filename: string) {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
