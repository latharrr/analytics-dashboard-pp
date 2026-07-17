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

export async function getTelegramSubscribers(): Promise<{ chat_id: number }[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("analytics_telegram_subscribers").select("chat_id");
  if (error) {
    console.error("getTelegramSubscribers failed:", error.message);
    return [];
  }
  return data ?? [];
}
