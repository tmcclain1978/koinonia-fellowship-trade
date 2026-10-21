/**
 * Second opinion from the AI on a setup the rules already found. The AI can
 * only veto: it never picks symbols, prices or share counts. If it can't be
 * reached, the trade is skipped (fail closed).
 */
import type { Signal } from "./strategy.ts";

export interface AiReview {
  approve: boolean;
  reason: string;
  model?: string;
}

export type AiReviewer = (s: Signal, context: { recentBars: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> }) => Promise<AiReview>;

const MODEL = "google/gemini-2.5-flash";

export function lovableReviewer(apiKey: string, f: typeof fetch = fetch): AiReviewer {
  return async (s, ctx) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const bars = ctx.recentBars.slice(-24).map((b) => [new Date(b.t).toISOString().slice(11, 16), b.o, b.h, b.l, b.c, b.v]);
      const res = await f("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "You review long day-trade setups found by fixed rules (uptrend, pullback to the 21 EMA, turn back up). " +
                "Approve unless you see a clear reason to skip: e.g. a blow-off spike, a gap-and-fade day, a lower-high structure, " +
                "or the last bars looking exhausted. You cannot change prices or size. Answer with the review tool. Keep the reason to one sentence.",
            },
            {
              role: "user",
              content: JSON.stringify({
                symbol: s.symbol, entry: s.entry, stop: s.stop, target: s.target, score: s.score,
                facts: s.facts, reasons: s.reasons, last24FiveMinuteBarsUtc: bars,
              }),
            },
          ],
          tools: [{
            type: "function",
            function: {
              name: "review",
              description: "Approve or veto the setup",
              parameters: {
                type: "object",
                properties: { approve: { type: "boolean" }, reason: { type: "string" } },
                required: ["approve", "reason"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "review" } },
        }),
      });
      if (!res.ok) throw new Error(res.status === 402 ? "AI credits exhausted" : res.status === 429 ? "AI rate limited" : `AI ${res.status}`);
      const d = await res.json();
      const args = d?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      const parsed = typeof args === "string" ? JSON.parse(args) : args;
      if (typeof parsed?.approve !== "boolean") throw new Error("AI gave no decision");
      return { approve: parsed.approve, reason: String(parsed.reason ?? "").slice(0, 300), model: MODEL };
    } finally {
      clearTimeout(timer);
    }
  };
}
