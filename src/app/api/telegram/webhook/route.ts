import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage, answerTelegramCallback } from "@/lib/telegram/client";
import { addTelegramSubscriber, isTelegramSubscriber } from "@/lib/db/telegramSubscribers";
import { runIntent, classifyIntent, MAIN_MENU } from "@/lib/telegram/intents";

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

  const result = await runIntent(callback.data ?? "");
  if (result) {
    await sendTelegramMessage(chatId, result.text, result.keyboard);
  }
}

async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat?.id;
  const text = typeof message.text === "string" ? message.text.trim() : "";
  if (!chatId) return;

  if (await isTelegramSubscriber(chatId)) {
    if (!text || text === "/start" || text === "/menu") {
      await sendTelegramMessage(chatId, "📊 What would you like to see?", MAIN_MENU);
      return;
    }
    const intentKey = await classifyIntent(text);
    const result = intentKey ? await runIntent(intentKey) : null;
    if (result) {
      await sendTelegramMessage(chatId, result.text, result.keyboard);
    } else {
      await sendTelegramMessage(chatId, "Not sure what you mean — here's what I can show you:", MAIN_MENU);
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
