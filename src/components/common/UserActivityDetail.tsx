"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { formatAsOf } from "@/lib/format";

export interface ActivityEvent {
  activityType: string;
  occurredAt: string;
  detail: string | null;
}

/**
 * The inner "Activity / When / Detail" table shown when a user row is expanded.
 * If `events` is provided (New User Activity inlines them), it renders directly;
 * otherwise it fetches the user's full timeline on demand from
 * /api/user-activity/[userId] (All Users, and NUA's "All users" mode).
 */
export function UserActivityDetail({
  userId,
  events: inlineEvents,
  colSpan,
}: {
  userId: string;
  events?: ActivityEvent[] | null;
  colSpan: number;
}) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(inlineEvents ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (inlineEvents !== undefined) {
      setEvents(inlineEvents);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/user-activity/${userId}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json: { events: ActivityEvent[] }) => setEvents(json.events ?? []))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [userId, inlineEvents]);

  return (
    <tr className="border-b border-border">
      <td colSpan={colSpan} className="bg-surface p-0">
        {loading && (
          <p className="flex items-center gap-2 p-3 pl-10 text-sm text-ink-muted">
            <Spinner className="h-4 w-4" /> Loading activity…
          </p>
        )}
        {!loading && events && events.length === 0 && (
          <p className="p-3 pl-10 text-sm text-ink-muted">No tracked activity for this user.</p>
        )}
        {!loading && events && events.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="whitespace-nowrap p-2 pl-10 text-left font-medium text-ink-muted">Activity</th>
                <th className="whitespace-nowrap p-2 text-left font-medium text-ink-muted">When</th>
                <th className="whitespace-nowrap p-2 text-left font-medium text-ink-muted">Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="whitespace-nowrap p-2 pl-10 text-ink">{e.activityType}</td>
                  <td className="whitespace-nowrap p-2 text-ink">{formatAsOf(e.occurredAt)}</td>
                  <td className="p-2 text-ink">{e.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}
