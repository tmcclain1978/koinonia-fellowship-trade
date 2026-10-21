import type { OrderFlowRecorder } from "./recorder";

/** Plain-language status for the order flow views. */
export function orderFlowStatus(rec: OrderFlowRecorder | null): { tone: "ok" | "warn" | "info"; text: string } {
  if (!rec) return { tone: "info", text: "Turn on any order flow view to start recording." };
  const since = new Date(rec.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (rec.feedStatus !== "streaming") {
    return {
      tone: "warn",
      text:
        rec.feedStatus === "connecting"
          ? "Connecting to the live Schwab stream…"
          : "The live Schwab stream isn't connected, so order flow is paused. (It can't be built from prices that only refresh every few seconds.) Check that Schwab is connected in Settings.",
    };
  }
  if (rec.bookStatus === "unavailable") {
    return { tone: "warn", text: `Schwab didn't send Level 2 data${rec.bookMessage ? ` (${rec.bookMessage})` : ""}. Trades, delta and footprint still work; the heatmap and ladder need Level 2.` };
  }
  if (rec.bookStatus !== "live") return { tone: "info", text: `Live stream connected. Waiting for the first Level 2 update (there's no book while the market is closed). Recording since ${since}.` };
  return { tone: "ok", text: `Live: Level 2 and trades, recording since ${since}.` };
}
