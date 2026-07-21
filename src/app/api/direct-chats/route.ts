import { NextRequest, NextResponse } from "next/server";
import {
  getChatConversations,
  getChatUsers,
  type ChatRoomKind,
  type ChatSortDir,
  type ConversationSortBy,
  type ChatUserSortBy,
} from "@/lib/db/directChats";

const PAGE_SIZE = 50;
const ALLOWED_KINDS: ChatRoomKind[] = ["all", "dm", "pool"];

function parseCommon(params: URLSearchParams) {
  const page = Math.max(1, Number(params.get("page")) || 1);
  const kindParam = params.get("roomKind") as ChatRoomKind | null;
  const roomKind: ChatRoomKind = kindParam && ALLOWED_KINDS.includes(kindParam) ? kindParam : "all";
  const sortDir: ChatSortDir = params.get("sortDir") === "asc" ? "asc" : "desc";
  return {
    page,
    roomKind,
    sortDir,
    search: params.get("search") || undefined,
    dateFrom: params.get("dateFrom") || undefined,
    dateTo: params.get("dateTo") || undefined,
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const view = params.get("view") === "user" ? "user" : "conversation";
  const common = parseCommon(params);

  if (view === "user") {
    const sortByParam = params.get("sortBy");
    const sortBy: ChatUserSortBy =
      sortByParam === "signed_up" || sortByParam === "messages" ? sortByParam : "recent";
    const { rows, totalCount } = await getChatUsers(
      {
        search: common.search,
        roomKind: common.roomKind,
        dateFrom: common.dateFrom,
        dateTo: common.dateTo,
        sortBy,
        sortDir: common.sortDir,
      },
      common.page,
      PAGE_SIZE
    );
    return NextResponse.json({ view, rows, totalCount, page: common.page, pageSize: PAGE_SIZE });
  }

  const sortByParam = params.get("sortBy");
  const sortBy: ConversationSortBy = sortByParam === "messages" ? "messages" : "recent";
  const { rows, totalCount } = await getChatConversations(
    {
      search: common.search,
      roomKind: common.roomKind,
      dateFrom: common.dateFrom,
      dateTo: common.dateTo,
      sortBy,
      sortDir: common.sortDir,
    },
    common.page,
    PAGE_SIZE
  );
  return NextResponse.json({ view, rows, totalCount, page: common.page, pageSize: PAGE_SIZE });
}
