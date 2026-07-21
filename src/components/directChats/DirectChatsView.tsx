"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { formatAsOf } from "@/lib/format";
import type {
  ChatConversation,
  ChatMessage,
  ChatUser,
  ChatUserMessage,
  ChatUserRoom,
} from "@/lib/db/directChats";

type View = "conversation" | "user";
type RoomKind = "all" | "dm" | "pool";
type SortDir = "asc" | "desc";

interface ListResponse {
  view: View;
  rows: ChatConversation[] | ChatUser[];
  totalCount: number;
  page: number;
  pageSize: number;
}

const ROOM_KINDS: { value: RoomKind; label: string }[] = [
  { value: "all", label: "All chats" },
  { value: "dm", label: "Direct (1-on-1)" },
  { value: "pool", label: "Pool / group" },
];

function participantNames(c: ChatConversation): string {
  if (c.participants.length > 0) return c.participants.map((p) => p.name ?? p.phone ?? "?").join(" ↔ ");
  return c.label;
}

/** Message timeline shown when a conversation or user row is expanded. */
function ChatMessagesDetail({
  roomId,
  userId,
  colSpan,
}: {
  roomId?: string;
  userId?: string;
  colSpan: number;
}) {
  const [rows, setRows] = useState<(ChatMessage & ChatUserMessage)[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const qs = roomId ? `roomId=${roomId}` : `userId=${userId}`;
    fetch(`/api/direct-chats/messages?${qs}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json: { rows: (ChatMessage & ChatUserMessage)[] }) => setRows(json.rows ?? []))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [roomId, userId]);

  return (
    <tr className="border-b border-border">
      <td colSpan={colSpan} className="bg-surface p-0">
        {loading && (
          <p className="flex items-center gap-2 p-3 pl-10 text-sm text-ink-muted">
            <Spinner className="h-4 w-4" /> Loading messages…
          </p>
        )}
        {!loading && rows && rows.length === 0 && (
          <p className="p-3 pl-10 text-sm text-ink-muted">No messages.</p>
        )}
        {!loading && rows && rows.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="whitespace-nowrap p-2 pl-10 text-left font-medium text-ink-muted">From</th>
                <th className="whitespace-nowrap p-2 text-left font-medium text-ink-muted">To / Room</th>
                <th className="whitespace-nowrap p-2 text-left font-medium text-ink-muted">When</th>
                <th className="p-2 text-left font-medium text-ink-muted">Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                // Room view rows have sender/recipient; user view rows have counterpart/roomLabel.
                const from = m.senderName ?? (userId ? "This user" : "—");
                const fromPhone = m.senderPhone;
                const to = roomId
                  ? m.recipientName ?? "—"
                  : `${m.roomLabel ?? "—"}${m.counterpartName ? ` · ${m.counterpartName}` : ""}`;
                const toPhone = roomId ? m.recipientPhone : m.counterpartPhone;
                return (
                  <tr key={m.messageId} className="border-t border-border/60 align-top">
                    <td className="whitespace-nowrap p-2 pl-10 text-ink">
                      {from}
                      {fromPhone ? <span className="block text-[11px] text-ink-muted">{fromPhone}</span> : null}
                    </td>
                    <td className="whitespace-nowrap p-2 text-ink">
                      {to}
                      {toPhone ? <span className="block text-[11px] text-ink-muted">{toPhone}</span> : null}
                    </td>
                    <td className="whitespace-nowrap p-2 text-ink">{formatAsOf(m.createdAt)}</td>
                    <td className="p-2 text-ink">
                      {m.isDeleted ? <span className="italic text-ink-muted">(deleted)</span> : m.content ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}

/**
 * "By user" drill-down: lists the rooms/pools a user has messaged in; each room
 * expands to open that room's full message timeline (ChatMessagesDetail).
 */
function ChatUserRoomsDetail({ userId, colSpan }: { userId: string; colSpan: number }) {
  const [rooms, setRooms] = useState<ChatUserRoom[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [openRoom, setOpenRoom] = useState<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/direct-chats/user-rooms?userId=${userId}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json: { rooms: ChatUserRoom[] }) => setRooms(json.rooms ?? []))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [userId]);

  function toggleRoom(id: string) {
    setOpenRoom((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <tr className="border-b border-border">
      <td colSpan={colSpan} className="bg-surface p-0">
        {loading && (
          <p className="flex items-center gap-2 p-3 pl-10 text-sm text-ink-muted">
            <Spinner className="h-4 w-4" /> Loading chats…
          </p>
        )}
        {!loading && rooms && rooms.length === 0 && (
          <p className="p-3 pl-10 text-sm text-ink-muted">No chats for this user.</p>
        )}
        {!loading && rooms && rooms.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="w-8 p-2 pl-10" />
                <th className="whitespace-nowrap p-2 text-left font-medium text-ink-muted">Type</th>
                <th className="whitespace-nowrap p-2 text-left font-medium text-ink-muted">Chat / pool</th>
                <th className="whitespace-nowrap p-2 text-right font-medium text-ink-muted">Their msgs</th>
                <th className="whitespace-nowrap p-2 text-left font-medium text-ink-muted">Last message</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => {
                const isOpen = openRoom.has(r.roomId);
                const title =
                  r.roomKind === "dm"
                    ? r.counterpartName
                      ? `${r.counterpartName}${r.counterpartPhone ? ` (${r.counterpartPhone})` : ""}`
                      : r.label
                    : r.label;
                return (
                  <Fragment key={r.roomId}>
                    <tr
                      onClick={() => toggleRoom(r.roomId)}
                      className="cursor-pointer border-t border-border/60 hover:bg-surface-raised"
                    >
                      <td className="p-2 pl-10 text-center text-ink-muted">{isOpen ? "▾" : "▸"}</td>
                      <td className="whitespace-nowrap p-2 text-ink">{r.roomKind === "dm" ? "Direct" : "Pool"}</td>
                      <td className="p-2 text-ink">{title}</td>
                      <td className="whitespace-nowrap p-2 text-right text-ink">{r.userMsgCount.toLocaleString()}</td>
                      <td className="whitespace-nowrap p-2 text-ink">
                        {r.lastMessageAt ? formatAsOf(r.lastMessageAt) : "—"}
                      </td>
                    </tr>
                    {isOpen && <ChatMessagesDetail roomId={r.roomId} colSpan={5} />}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}

export function DirectChatsView() {
  const [view, setView] = useState<View>("conversation");
  const [roomKind, setRoomKind] = useState<RoomKind>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<string>("recent");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Reset paging/expansion whenever the query changes.
  useEffect(() => {
    setPage(1);
  }, [view, roomKind, search, dateFrom, dateTo, sortBy, sortDir]);

  // "signed_up" only makes sense in the user view.
  useEffect(() => {
    if (view === "conversation" && sortBy === "signed_up") setSortBy("recent");
  }, [view, sortBy]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("view", view);
    params.set("roomKind", roomKind);
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    if (search.trim()) params.set("search", search.trim());
    if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString());
    if (dateTo) params.set("dateTo", new Date(dateTo).toISOString());
    return params.toString();
  }, [view, roomKind, search, dateFrom, dateTo, sortBy, sortDir]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timeout = setTimeout(() => {
      fetch(`/api/direct-chats?${queryString}&page=${page}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((json: ListResponse) => {
          setData(json);
          setExpanded(new Set());
        })
        .catch((err) => {
          if (err.name !== "AbortError") console.error(err);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [queryString, page]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / data.pageSize)) : 1;
  const sortOptions =
    view === "conversation"
      ? [
          { value: "recent", label: "Last message" },
          { value: "messages", label: "Message count" },
        ]
      : [
          { value: "recent", label: "Last message" },
          { value: "signed_up", label: "Signed up (new/old user)" },
          { value: "messages", label: "Message count" },
        ];

  return (
    <div>
      <div className="mb-4 inline-flex rounded-lg border border-border p-0.5 text-sm">
        {(
          [
            { value: "conversation", label: "By conversation" },
            { value: "user", label: "By user" },
          ] as const
        ).map((v) => (
          <button
            key={v.value}
            onClick={() => setView(v.value)}
            className={`rounded-md px-3 py-1.5 ${
              view === v.value ? "bg-accent/10 font-medium text-accent" : "text-ink-muted hover:bg-surface-raised"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-raised p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Search (name / phone)</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. Rohan or 98765…"
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Chat type</label>
          <select
            value={roomKind}
            onChange={(e) => setRoomKind(e.target.value as RoomKind)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          >
            {ROOM_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Active from</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Active to</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Sort by</label>
          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
            >
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as SortDir)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink"
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>
        </div>
        {data && <span className="text-sm text-ink-muted">{data.totalCount.toLocaleString()} {view === "user" ? "users" : "conversations"}</span>}
        <a
          href={`/api/direct-chats/csv?${queryString}`}
          className="ml-auto rounded-lg border border-border px-3 py-1.5 text-sm text-ink hover:bg-surface-raised"
        >
          Export CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        {/* Render the table that matches the DATA actually loaded (data.view), not the
            pending toggle (view): on a view switch, `view` flips immediately but `data`
            still holds the previous shape for one render, so keying off `view` would read
            conversation rows as user rows (undefined counts → crash). */}
        {(data?.view ?? view) === "conversation" ? (
          <table className="w-full text-sm">
            <thead className="bg-surface-raised">
              <tr>
                <th className="w-8 border-b border-border p-2" />
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                  Conversation
                </th>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Type</th>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Phones</th>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                  Messages
                </th>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                  Last message
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-ink-muted">
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="h-4 w-4" /> Loading…
                    </span>
                  </td>
                </tr>
              )}
              {!loading &&
                (data?.rows as ChatConversation[] | undefined)?.map((c) => {
                  const isOpen = expanded.has(c.roomId);
                  return (
                    <Fragment key={c.roomId}>
                      <tr
                        onClick={() => toggle(c.roomId)}
                        className="cursor-pointer border-b border-border hover:bg-surface-raised"
                      >
                        <td className="p-2 text-center text-ink-muted">{isOpen ? "▾" : "▸"}</td>
                        <td className="p-2 font-medium text-ink">{participantNames(c)}</td>
                        <td className="whitespace-nowrap p-2 text-ink">{c.roomKind === "dm" ? "Direct" : "Pool"}</td>
                        <td className="whitespace-nowrap p-2 text-ink-muted">
                          {c.participants.map((p) => p.phone).filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className="whitespace-nowrap p-2 text-ink">{c.messageCount.toLocaleString()}</td>
                        <td className="whitespace-nowrap p-2 text-ink">
                          {c.lastMessageAt ? formatAsOf(c.lastMessageAt) : "—"}
                        </td>
                      </tr>
                      {isOpen && <ChatMessagesDetail roomId={c.roomId} colSpan={6} />}
                    </Fragment>
                  );
                })}
              {!loading && data?.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-ink-muted">
                    No conversations match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-raised">
              <tr>
                <th className="w-8 border-b border-border p-2" />
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">User</th>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Phone</th>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                  Signed up
                </th>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">DMs</th>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                  Pool msgs
                </th>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">Total</th>
                <th className="whitespace-nowrap border-b border-border p-2 text-left font-medium text-ink">
                  Last message
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-ink-muted">
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="h-4 w-4" /> Loading…
                    </span>
                  </td>
                </tr>
              )}
              {!loading &&
                (data?.rows as ChatUser[] | undefined)?.map((u) => {
                  const isOpen = expanded.has(u.userId);
                  return (
                    <Fragment key={u.userId}>
                      <tr
                        onClick={() => toggle(u.userId)}
                        className="cursor-pointer border-b border-border hover:bg-surface-raised"
                      >
                        <td className="p-2 text-center text-ink-muted">{isOpen ? "▾" : "▸"}</td>
                        <td className="whitespace-nowrap p-2 font-medium text-ink">{u.userName ?? u.userId}</td>
                        <td className="whitespace-nowrap p-2 text-ink">{u.phone ?? "—"}</td>
                        <td className="whitespace-nowrap p-2 text-ink">{formatAsOf(u.signedUpAt)}</td>
                        <td className="whitespace-nowrap p-2 text-ink">{u.dmMsgCount.toLocaleString()}</td>
                        <td className="whitespace-nowrap p-2 text-ink">{u.poolMsgCount.toLocaleString()}</td>
                        <td className="whitespace-nowrap p-2 text-ink">{u.totalMsgs.toLocaleString()}</td>
                        <td className="whitespace-nowrap p-2 text-ink">
                          {u.lastMessageAt ? formatAsOf(u.lastMessageAt) : "—"}
                        </td>
                      </tr>
                      {isOpen && <ChatUserRoomsDetail userId={u.userId} colSpan={8} />}
                    </Fragment>
                  );
                })}
              {!loading && data?.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-ink-muted">
                    No users match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 text-sm text-ink-muted">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded border border-border px-2 py-1 disabled:opacity-40"
        >
          Prev
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          className="rounded border border-border px-2 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
      <p className="mt-2 text-[11px] text-ink-muted/70">
        Click a row to expand its full message timeline (sender, recipient, time, and text). &ldquo;Direct&rdquo; is a
        1-on-1 DM; &ldquo;Pool&rdquo; is a pool/group room. Bot accounts are excluded from the By-user roster. Message
        text is real user content — handle exports accordingly. Data is only as fresh as the last import.
      </p>
    </div>
  );
}
