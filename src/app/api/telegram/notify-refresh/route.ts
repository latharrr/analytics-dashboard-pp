import { NextRequest, NextResponse } from "next/server";
import { getRefreshInfo } from "@/lib/db/kpi";
import { getTelegramSubscribers } from "@/lib/db/telegramSubscribers";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { formatAsOf } from "@/lib/format";

export const maxDuration = 30;

/**
 * GET, bearer-token-gated. Vercel Cron triggers this daily, a few minutes
 * after the nightly pg_cron KPI refresh (see vercel.json + migration 010),
 * and messages every verified Telegram subscriber.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [info, subscribers] = await Promise.all([getRefreshInfo(), getTelegramSubscribers()]);
  const asOf = info ? formatAsOf(info.refreshed_at) : "unknown time";
  const text = `📊 Picapool dashboard data refreshed — as of ${asOf}.`;

  await Promise.all(subscribers.map((s) => sendTelegramMessage(s.chat_id, text)));

  return NextResponse.json({
    ok: true,
    notified: subscribers.length,
    refreshed_at: info?.refreshed_at ?? null,
  });
}
