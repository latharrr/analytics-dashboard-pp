import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage, answerTelegramCallback } from "@/lib/telegram/client";
import { addTelegramSubscriber, isTelegramSubscriber } from "@/lib/db/telegramSubscribers";
import { runIntent, classifyMetric, runMetric, MAIN_MENU } from "@/lib/telegram/intents";
import { checkRateLimit } from "@/lib/security/rateLimit";

export const maxDuration = 15;

interface TelegramMessage {
  chat: { id: number };
  text?: string;
  from?: { username?: string };
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: { chat: { id: number } };
}

interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

/**
 * POST, gated by the `secret_token` Telegram attaches as
 * X-Telegram-Bot-Api-Secret-Token when the webhook is registered via
 * setWebhook (see README). Anyone who messages the bot is asked for the
 * shared password once; after that their chat_id is stored and they can
 * use the button menu or ask a free-text question (classified into a
 * fixed, pre-vetted set of queries — see intents.ts). Also the target of
 * /api/telegram/notify-refresh's daily broadcast.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update: TelegramUpdate | null = await request.json().catch(() => null);

  try {
    if (update?.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update?.message) {
      await handleMessage(update.message);
    }
  } catch (err) {
    console.error("telegram webhook failed:", err);
  }

  // Always 200 back to Telegram (even for update types we don't handle,
  // like edited_message) so it doesn't keep retrying the same update.
  return NextResponse.json({ ok: true });
}

async function handleCallback(callback: TelegramCallbackQuery): Promise<void> {
  await answerTelegramCallback(callback.id);
  const chatId = callback.message?.chat?.id;
  if (!chatId) return;

  const allowed = await checkRateLimit(String(chatId), {
    route: "telegram-callback",
    windowSeconds: 60,
    maxRequests: 30,
  });
  if (!allowed) return;

  const result = await runIntent(callback.data ?? "");
  if (result) {
    await sendTelegramMessage(chatId, result.text, result.keyboard);
  }
}

async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat?.id;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  if (!chatId) return;

  const isSubscriber = await isTelegramSubscriber(chatId);

  // Tighter limit while unauthenticated, since this is the password brute-
  // force surface; looser once verified, since queries are just reads.
  const allowed = await checkRateLimit(String(chatId), isSubscriber
    ? { route: "telegram-query", windowSeconds: 60, maxRequests: 20 }
    : { route: "telegram-auth", windowSeconds: 300, maxRequests: 5 });
  if (!allowed) {
    if (isSubscriber) {
      await sendTelegramMessage(chatId, "⏳ Too many messages — please wait a bit and try again.");
    }
    // Deliberately silent when NOT yet subscribed: telling a password
    // brute-forcer "you're rate limited" just confirms the endpoint is
    // live and worth continuing to attack.
    return;
  }

  if (isSubscriber) {
    if (!text || text === "/start" || text === "/menu") {
      await sendTelegramMessage(chatId, "📊 What would you like to see?", MAIN_MENU);
      return;
    }
    const metric = await classifyMetric(text);
    const result = metric ? await runMetric(metric, text) : null;
    if (result) {
      await sendTelegramMessage(chatId, result.text, result.keyboard);
    } else {
      await sendTelegramMessage(
        chatId,
        "I didn't catch a specific metric in that — here's everything I can pull up, tap any button:",
        MAIN_MENU
      );
    }
    return;
  }

  if (text && text === process.env.TELEGRAM_BOT_PASSWORD) {
    await addTelegramSubscriber(chatId, message.from?.username);
    await sendTelegramMessage(
      chatId,
      "✅ Verified. You'll get a message here whenever new dashboard data is fetched."
    );
    await sendTelegramMessage(chatId, "📊 What would you like to see?", MAIN_MENU);
  } else {
    await sendTelegramMessage(chatId, "🔒 Send the password to subscribe to daily dashboard updates.");
  }
}
