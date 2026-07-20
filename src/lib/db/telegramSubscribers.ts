import { getServiceClient } from "@/lib/supabase/server";

export async function isTelegramSubscriber(chatId: number): Promise<boolean> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("analytics_telegram_subscribers")
    .select("chat_id")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (error) {
    console.error("isTelegramSubscriber failed:", error.message);
    return false;
  }
  return data !== null;
}

export async function addTelegramSubscriber(chatId: number, username: string | undefined): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("analytics_telegram_subscribers")
    .upsert({ chat_id: chatId, username: username ?? null }, { onConflict: "chat_id" });
  if (error) {
    console.error("addTelegramSubscriber failed:", error.message);
  }
}

const SUBSCRIBER_PAGE_SIZE = 1000;

/**
 * Every subscriber chat_id, paginated past this project's REST "Max rows =
 * 1000" default so the daily notify-refresh broadcast never silently skips
 * subscribers beyond the first 1000. A bare `.select()` would cap there.
 */
export async function getTelegramSubscribers(): Promise<{ chat_id: number }[]> {
  const supabase = getServiceClient();
  const rows: { chat_id: number }[] = [];
  for (let from = 0; ; from += SUBSCRIBER_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("analytics_telegram_subscribers")
      .select("chat_id")
      .range(from, from + SUBSCRIBER_PAGE_SIZE - 1);
    if (error) {
      console.error("getTelegramSubscribers failed:", error.message);
      break;
    }
    const page = (data ?? []) as { chat_id: number }[];
    rows.push(...page);
    if (page.length < SUBSCRIBER_PAGE_SIZE) break;
  }
  return rows;
}
