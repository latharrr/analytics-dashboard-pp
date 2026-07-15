"use client";

import { useState } from "react";
import { formatValue } from "@/lib/format";

interface Turn {
  question: string;
  answer?: string;
  citation?: string;
  sql?: string;
  rows?: Record<string, unknown>[];
  error?: string;
}

const EXAMPLE_QUESTIONS = [
  "How many users joined in the last 30 days?",
  "What's the average number of trust actions per user?",
  "Which pool type has the best completion rate?",
  "What are the top 5 colleges by number of users?",
];

export function ChatPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask(question: string) {
    if (!question.trim() || loading) return;
    setLoading(true);
    setInput("");
    setTurns((t) => [...t, { question }]);

    try {
      const res = await fetch("/api/ai-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const json = await res.json();

      setTurns((t) => {
        const next = [...t];
        const last = next[next.length - 1];
        if (!res.ok) {
          next[next.length - 1] = { ...last, error: json.error ?? "Something went wrong." };
        } else {
          next[next.length - 1] = {
            ...last,
            answer: json.answer,
            citation: json.citation,
            sql: json.sql,
            rows: json.rows,
          };
        }
        return next;
      });
    } catch (err) {
      setTurns((t) => {
        const next = [...t];
        next[next.length - 1] = { ...next[next.length - 1], error: String(err) };
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-4">
        {turns.length === 0 && (
          <div>
            <p className="mb-2 text-sm text-ink-muted">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-ink hover:bg-surface-raised"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-auto max-w-[80%] rounded-xl bg-accent/10 px-3 py-2 text-sm text-ink">
              {turn.question}
            </div>
            {turn.error && (
              <div className="max-w-[80%] rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600">
                {turn.error}
              </div>
            )}
            {turn.answer && (
              <div className="max-w-[80%] space-y-2 rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-ink">
                <p>{turn.answer}</p>
                {turn.citation && <p className="text-xs text-ink-muted">{turn.citation}</p>}
                {turn.rows && turn.rows.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-xs text-ink-muted">
                      Show {turn.rows.length} raw row{turn.rows.length === 1 ? "" : "s"}
                    </summary>
                    <div className="mt-1 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-ink-muted">
                            {Object.keys(turn.rows[0]).map((col) => (
                              <th key={col} className="pr-3 pb-1 font-normal">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {turn.rows.map((row, ri) => (
                            <tr key={ri} className="border-t border-border">
                              {Object.keys(turn.rows![0]).map((col) => (
                                <td key={col} className="pr-3 py-1">
                                  {formatValue(row[col])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && <p className="text-sm text-ink-muted">Thinking…</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about the data…"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
