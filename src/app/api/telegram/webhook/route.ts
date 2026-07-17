import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { addTelegramSubscriber, isTelegramSubscriber } from "@/lib/db/telegramSubscribers";

/**
 * POST, gated by the `secret_token` Telegram attaches as
 * X-Telegram-Bot-Api-Secret-Token when the webhook is registered via
 * setWebhook (see README). Anyone who messages the bot is asked for the
 * shared password once; after that their chat_id is stored and
 * /api/telegram/notify-refresh will message them daily.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update = await request.json().catch(() => null);
  const message = update?.message;
  const chatId = message?.chat?.id;
  const text = typeof message?.text === "string" ? message.text.trim() : "";

  // Always 200 back to Telegram (even for update types we don't handle,
  // like edited_message) so it doesn't keep retrying the same update.
  if (!chatId) {
    return NextResponse.json({ ok: true });
  }

  try {
    if (await isTelegramSubscriber(chatId)) {
      await sendTelegramMessage(
        chatId,
        "You're already subscribed — I'll message you here whenever new dashboard data is fetched."
      );
    } else if (text && text === process.env.TELEGRAM_BOT_PASSWORD) {
      await addTelegramSubscriber(chatId, message.from?.username);
      await sendTelegramMessage(
        chatId,
        "✅ Verified. You'll get a message here whenever new dashboard data is fetched."
      );
    } else {
      await sendTelegramMessage(chatId, "🔒 Send the password to subscribe to daily dashboard updates.");
    }
  } catch (err) {
    console.error("telegram webhook failed:", err);
  }

  return NextResponse.json({ ok: true });
}
