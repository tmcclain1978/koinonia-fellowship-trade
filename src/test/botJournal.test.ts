import { describe, it, expect } from "vitest";
import { NOTES_DIVIDER, botJournalEntry, mergeContent, mergeTags } from "../../supabase/functions/_shared/bot/journal";
import { botLabel, isBotEntry, matchesSource } from "@/lib/journal/botEntries";

const trade = (over: Record<string, unknown> = {}) => ({
  id: "t1", user_id: "u", mode: "paper", broker: "paper", symbol: "AAPL", status: "open", quantity: 10, signal_price: 190, entry_price: 190, initial_stop: 189, stop_price: 189, target_price: 192,
  entry_order_id: null, stop_order_id: null, exit_order_id: null, exit_price: null, exit_reason: null, pnl: null, r_multiple: null,
  signal: { reasons: ["VWAP reclaim"], score: 70 }, ai_review: null, last_checked_at: null, note: null, opened_at: "2026-10-21T14:00:00Z", closed_at: null, trade_date: "2026-10-21", ...over,
}) as never;

describe("bot trades in the journal", () => {
  it("no entry until the buy fills", () => {
    expect(botJournalEntry(trade({ entry_price: null, status: "entering" }))).toBeNull();
  });
  it("open, closed and problem entries", () => {
    expect(botJournalEntry(trade())!.tags).toEqual(["bot", "paper", "open"]);
    const c = botJournalEntry(trade({ status: "closed", exit_price: 189, exit_reason: "stop", pnl: -10, r_multiple: -1, closed_at: "2026-10-21T14:30:00Z" }))!;
    expect(c.tags).toEqual(["bot", "paper", "loss"]);
    expect(c.content).toContain("Sold @ $189.00: hit the stop. Result −$10.00 (-1.00R), held 30 min.");
    const e = botJournalEntry(trade({ mode: "live", broker: "robinhood", status: "error", note: "order state unknown" }))!;
    expect(e.content.split("\n")[0]).toBe("🤖 Bot trade · LIVE money · robinhood");
    expect(e.tags).toEqual(["bot", "live", "needs-attention"]);
  });
  it("keeps the user's notes and tags", () => {
    const first = mergeContent("BOT v1", null);
    expect(first).toBe(`BOT v1\n\n${NOTES_DIVIDER}\n`);
    const edited = first + "my note";
    expect(mergeContent("BOT v2", edited)).toBe(`BOT v2\n\n${NOTES_DIVIDER}\nmy note`);
    expect(mergeTags(["bot", "paper", "win"], ["bot", "paper", "open", "fomo"])).toEqual(["bot", "paper", "win", "fomo"]);
  });
  it("labels and filters on the Journal page", () => {
    expect(botLabel({ bot_trade_id: "x", tags: ["bot", "live"] })).toEqual({ text: "Bot · LIVE", live: true });
    expect(botLabel({ tags: ["bot", "paper"] })!.text).toBe("Bot · Paper");
    expect(isBotEntry({ tags: ["fomo"] })).toBe(false);
    expect(matchesSource({ tags: null }, "mine")).toBe(true);
    expect(matchesSource({ bot_trade_id: "x" }, "mine")).toBe(false);
    expect(matchesSource({ bot_trade_id: "x" }, "bot")).toBe(true);
  });
});
