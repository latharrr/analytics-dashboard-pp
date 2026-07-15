import { getServiceClient } from "@/lib/supabase/server";

/**
 * Logs a question/SQL/answer turn to analytics_ai_query_log (migration 013).
 * Deliberately not copilot_chats/copilot_messages: those belong to an
 * existing in-app admin-copilot feature keyed to a real users.id via a
 * NOT NULL FK, which this dashboard's shared login can't correctly supply.
 * A logging failure must never break the actual answer shown to the user.
 */
export async function logAiQueryTurn(params: {
  question: string;
  sql: string;
  answer: string;
  rowCount: number;
}): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase.from("analytics_ai_query_log").insert({
    question: params.question,
    generated_sql: params.sql,
    answer: params.answer,
    row_count: params.rowCount,
  });

  if (error) {
    console.warn("logAiQueryTurn: failed to log to analytics_ai_query_log:", error.message);
  }
}
