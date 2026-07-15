import Groq from "groq-sdk";

let client: Groq | null = null;

function getGroqClient(): Groq {
  if (client) return client;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");
  client = new Groq({ apiKey });
  return client;
}

/** Asks Groq to translate a plain-English question into SQL. Returns raw model output. */
export async function generateSql(systemPrompt: string, question: string): Promise<string> {
  const groq = getGroqClient();
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const completion = await groq.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 800,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

/** Turns a SQL result set into a short plain-language answer. */
export async function summarizeResult(question: string, sql: string, rows: Record<string, unknown>[]): Promise<string> {
  const groq = getGroqClient();
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const preview = rows.slice(0, 20);
  const completion = await groq.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 400,
    messages: [
      {
        role: "system",
        content:
          "You explain SQL query results in one or two plain-English sentences for a non-technical founder. Be direct and cite concrete numbers from the data. Do not mention SQL or the query itself.",
      },
      {
        role: "user",
        content: `Question: ${question}\nSQL: ${sql}\nResult rows (JSON, up to 20 shown of ${rows.length} total): ${JSON.stringify(preview)}`,
      },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? "";
}
