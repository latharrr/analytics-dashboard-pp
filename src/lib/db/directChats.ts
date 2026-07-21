import { getServiceClient } from "@/lib/supabase/server";

export type ChatRoomKind = "all" | "dm" | "pool";
export type ChatSortDir = "asc" | "desc";
export type ConversationSortBy = "recent" | "messages";
export type ChatUserSortBy = "recent" | "signed_up" | "messages";

export interface ChatParticipant {
  user_id: string;
  name: string | null;
  phone: string | null;
}

export interface ChatConversation {
  roomId: string;
  roomKind: "dm" | "pool";
  label: string;
  poolTitle: string | null;
  participants: ChatParticipant[];
  participantCount: number;
  messageCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
}

export interface ChatMessage {
  messageId: string;
  senderId: string | null;
  senderName: string | null;
  senderPhone: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  content: string | null;
  msgType: string | null;
  isDeleted: boolean;
  createdAt: string;
}

export interface ChatUser {
  userId: string;
  userName: string | null;
  phone: string | null;
  signedUpAt: string;
  dmMsgCount: number;
  poolMsgCount: number;
  totalMsgs: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
}

export interface ChatUserRoom {
  roomId: string;
  roomKind: "dm" | "pool";
  label: string;
  counterpartName: string | null;
  counterpartPhone: string | null;
  userMsgCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
}

export interface ChatUserMessage {
  messageId: string;
  roomId: string;
  roomKind: "dm" | "pool";
  roomLabel: string;
  counterpartName: string | null;
  counterpartPhone: string | null;
  content: string | null;
  msgType: string | null;
  isDeleted: boolean;
  createdAt: string;
}

export interface ChatConversationFilters {
  search?: string;
  roomKind?: ChatRoomKind;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: ConversationSortBy;
  sortDir?: ChatSortDir;
}

export interface ChatUserFilters {
  search?: string;
  roomKind?: ChatRoomKind;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: ChatUserSortBy;
  sortDir?: ChatSortDir;
}

interface Paged<T> {
  rows: T[];
  totalCount: number;
}

/** PostgREST caps every response (incl. RPC results) at this project's "Max rows = 1000". */
const EXPORT_PAGE_SIZE = 1000;

/** One row per chat conversation (room). Backed by analytics_chat_conversations() (migration 042). */
export async function getChatConversations(
  filters: ChatConversationFilters,
  page: number,
  pageSize: number
): Promise<Paged<ChatConversation>> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_chat_conversations", {
    search_text: filters.search ?? null,
    room_kind: filters.roomKind ?? "all",
    date_from: filters.dateFrom ?? null,
    date_to: filters.dateTo ?? null,
    sort_by: filters.sortBy ?? "recent",
    sort_dir: filters.sortDir ?? "desc",
    page_number: page,
    page_size: pageSize,
  });
  if (error) {
    console.error("getChatConversations failed:", error.message);
    return { rows: [], totalCount: 0 };
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    rows: rows.map((r) => ({
      roomId: r.room_id as string,
      roomKind: r.room_kind_out as "dm" | "pool",
      label: r.label as string,
      poolTitle: (r.pool_title as string) ?? null,
      participants: (r.participants as ChatParticipant[]) ?? [],
      participantCount: Number(r.participant_count ?? 0),
      messageCount: Number(r.message_count ?? 0),
      firstMessageAt: (r.first_message_at as string) ?? null,
      lastMessageAt: (r.last_message_at as string) ?? null,
    })),
    totalCount: Number(rows[0]?.total_count ?? 0),
  };
}

/** Messages in one room, newest first. Backed by analytics_chat_room_messages() (migration 042). */
export async function getChatRoomMessages(
  roomId: string,
  page: number,
  pageSize: number
): Promise<Paged<ChatMessage>> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_chat_room_messages", {
    target_room: roomId,
    page_number: page,
    page_size: pageSize,
  });
  if (error) {
    console.error("getChatRoomMessages failed:", error.message);
    return { rows: [], totalCount: 0 };
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    rows: rows.map((r) => ({
      messageId: r.message_id as string,
      senderId: (r.sender_id as string) ?? null,
      senderName: (r.sender_name as string) ?? null,
      senderPhone: (r.sender_phone as string) ?? null,
      recipientName: (r.recipient_name as string) ?? null,
      recipientPhone: (r.recipient_phone as string) ?? null,
      content: (r.content as string) ?? null,
      msgType: (r.msg_type as string) ?? null,
      isDeleted: Boolean(r.is_deleted),
      createdAt: r.created_at as string,
    })),
    totalCount: Number(rows[0]?.total_count ?? 0),
  };
}

/** One row per human user who sent messages. Backed by analytics_chat_users() (migration 042). */
export async function getChatUsers(
  filters: ChatUserFilters,
  page: number,
  pageSize: number
): Promise<Paged<ChatUser>> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_chat_users", {
    search_text: filters.search ?? null,
    room_kind: filters.roomKind ?? "all",
    date_from: filters.dateFrom ?? null,
    date_to: filters.dateTo ?? null,
    sort_by: filters.sortBy ?? "recent",
    sort_dir: filters.sortDir ?? "desc",
    page_number: page,
    page_size: pageSize,
  });
  if (error) {
    console.error("getChatUsers failed:", error.message);
    return { rows: [], totalCount: 0 };
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    rows: rows.map((r) => ({
      userId: r.user_id as string,
      userName: (r.user_name as string) ?? null,
      phone: (r.phone as string) ?? null,
      signedUpAt: r.signed_up_at as string,
      dmMsgCount: Number(r.dm_msg_count ?? 0),
      poolMsgCount: Number(r.pool_msg_count ?? 0),
      totalMsgs: Number(r.total_msgs ?? 0),
      firstMessageAt: (r.first_message_at as string) ?? null,
      lastMessageAt: (r.last_message_at as string) ?? null,
    })),
    totalCount: Number(rows[0]?.total_count ?? 0),
  };
}

/** Messages sent by one user, newest first. Backed by analytics_chat_user_messages() (migration 042). */
export async function getChatUserMessages(
  userId: string,
  page: number,
  pageSize: number
): Promise<Paged<ChatUserMessage>> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_chat_user_messages", {
    target_user: userId,
    page_number: page,
    page_size: pageSize,
  });
  if (error) {
    console.error("getChatUserMessages failed:", error.message);
    return { rows: [], totalCount: 0 };
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    rows: rows.map((r) => ({
      messageId: r.message_id as string,
      roomId: r.room_id as string,
      roomKind: r.room_kind_out as "dm" | "pool",
      roomLabel: r.room_label as string,
      counterpartName: (r.counterpart_name as string) ?? null,
      counterpartPhone: (r.counterpart_phone as string) ?? null,
      content: (r.content as string) ?? null,
      msgType: (r.msg_type as string) ?? null,
      isDeleted: Boolean(r.is_deleted),
      createdAt: r.created_at as string,
    })),
    totalCount: Number(rows[0]?.total_count ?? 0),
  };
}

/** The rooms (DMs + pools) a user has messaged in. Backed by analytics_chat_user_rooms() (migration 044). */
export async function getChatUserRooms(userId: string): Promise<ChatUserRoom[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("analytics_chat_user_rooms", { target_user: userId });
  if (error) {
    console.error("getChatUserRooms failed:", error.message);
    return [];
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    roomId: r.room_id as string,
    roomKind: r.room_kind_out as "dm" | "pool",
    label: r.label as string,
    counterpartName: (r.counterpart_name as string) ?? null,
    counterpartPhone: (r.counterpart_phone as string) ?? null,
    userMsgCount: Number(r.user_msg_count ?? 0),
    firstMessageAt: (r.first_message_at as string) ?? null,
    lastMessageAt: (r.last_message_at as string) ?? null,
  }));
}

/** Conversations matching the filters, for CSV export — paged past the 1000-row cap. */
export async function getChatConversationsForExport(
  filters: ChatConversationFilters,
  cap = 10_000
): Promise<ChatConversation[]> {
  const all: ChatConversation[] = [];
  for (let page = 1; all.length < cap; page++) {
    const { rows } = await getChatConversations(filters, page, EXPORT_PAGE_SIZE);
    all.push(...rows);
    if (rows.length < EXPORT_PAGE_SIZE) break;
  }
  return all.slice(0, cap);
}

/** Users matching the filters, for CSV export — paged past the 1000-row cap. */
export async function getChatUsersForExport(filters: ChatUserFilters, cap = 10_000): Promise<ChatUser[]> {
  const all: ChatUser[] = [];
  for (let page = 1; all.length < cap; page++) {
    const { rows } = await getChatUsers(filters, page, EXPORT_PAGE_SIZE);
    all.push(...rows);
    if (rows.length < EXPORT_PAGE_SIZE) break;
  }
  return all.slice(0, cap);
}
