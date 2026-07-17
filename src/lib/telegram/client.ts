export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

/** Thin wrapper around the Telegram Bot API's sendMessage call. Server-only. */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
  keyboard?: InlineKeyboardButton[][]
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN env var");
  }

  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (keyboard) {
    body.reply_markup = { inline_keyboard: keyboard };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`sendTelegramMessage(${chatId}) failed: ${res.status} ${body}`);
  }
}

/** Stops the button's loading spinner in the Telegram client. Must be called for every callback_query update. */
export async function answerTelegramCallback(callbackQueryId: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN env var");
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`answerTelegramCallback(${callbackQueryId}) failed: ${res.status} ${body}`);
  }
}
