/**
 * Bot trades in the Trading Journal: one entry per filled bot trade, labeled
 * (tags "bot" + "paper"/"live") and linked by bot_trade_id. The entry is
 * written when the buy fills and filled in with the result when it closes.
 * Anything the user writes under "Your notes" is kept on every update.
 */
import type { TradeRow } from "./engine.ts";

export const NOTES_DIVIDER = "— Your notes —";
const STATUS_TAGS = ["open", "win", "loss", "needs-attention"];

const money = (v: number) => `$${v.toFixed(2)}`;
const signedMoney = (v: number) => `${v >= 0 ? "+" : "−"}$${Math.abs(v).toFixed(2)}`;

const EXIT_REASONS: Record<string, string> = {
  target: "hit the profit target",
  stop: "hit the stop",
  trailing_stop: "hit the trailing stop",
  breakeven: "stopped at break-even",
  end_of_day: "end of day (the bot is flat by the close)",
  kill_switch: "you asked the bot to close everything",
  manual: "closed by hand",
};
const reasonText = (r: string | null) => (r ? EXIT_REASONS[r] ?? r.replace(/_/g, " ") : "closed");

function minutesBetween(a: string, b: string) {
  const m = Math.round((Date.parse(b) - Date.parse(a)) / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export interface BotJournalEntry {
  symbol: string;
  content: string;
  tags: string[];
  entry_date: string;
}

/** The entry for a bot trade, or null if the buy never filled (nothing happened in the account). */
export function botJournalEntry(t: TradeRow): BotJournalEntry | null {
  if (!(Number(t.entry_price) > 0)) return null;
  const live = t.mode === "live";
  const entry = Number(t.entry_price);
  const qty = Number(t.quantity);
  const sig = (t.signal ?? {}) as { reasons?: string[]; score?: number };
  const ai = (t.ai_review ?? null) as { reason?: string } | null;
  const lines: string[] = [];
  lines.push(`🤖 Bot trade · ${live ? "LIVE money" : "paper"} · ${t.broker}`);
  lines.push(`Bought ${qty} ${t.symbol} @ ${money(entry)} (${money(qty * entry)}).`);
  lines.push(`Plan: stop ${money(Number(t.initial_stop))}, target ${money(Number(t.target_price))} (risking ${money(Math.max(0, entry - Number(t.initial_stop)) * qty)}).`);
  if (sig.reasons?.length) lines.push(`Why: ${sig.reasons.join("; ")}${typeof sig.score === "number" ? ` (score ${sig.score})` : ""}.`);
  if (ai?.reason) lines.push(`AI check: ${ai.reason}`);

  const tags = ["bot", live ? "live" : "paper"];
  if (t.status === "closed" && Number(t.exit_price) > 0) {
    const pnl = Number(t.pnl ?? (Number(t.exit_price) - entry) * qty);
    const r = t.r_multiple;
    lines.push(
      `Sold @ ${money(Number(t.exit_price))}: ${reasonText(t.exit_reason)}.` +
        ` Result ${signedMoney(pnl)}${typeof r === "number" && Number.isFinite(r) ? ` (${r >= 0 ? "+" : ""}${r.toFixed(2)}R)` : ""}` +
        (t.closed_at ? `, held ${minutesBetween(t.opened_at, t.closed_at)}.` : "."),
    );
    tags.push(pnl >= 0 ? "win" : "loss");
  } else if (t.status === "error") {
    lines.push(`⚠ Needs attention: ${t.note ?? "the bot stopped managing this trade"}. Check the position at the broker.`);
    tags.push("needs-attention");
  } else {
    if (Number(t.stop_price) !== Number(t.initial_stop)) lines.push(`Stop moved to ${money(Number(t.stop_price))}.`);
    lines.push(t.status === "exiting" ? "Selling now…" : "Still open.");
    tags.push("open");
  }
  return { symbol: t.symbol, content: lines.join("\n"), tags, entry_date: t.opened_at };
}

/** Bot text on top, the user's notes (if any) kept below the divider. */
export function mergeContent(botText: string, existing: string | null | undefined): string {
  const i = existing ? existing.indexOf(NOTES_DIVIDER) : -1;
  const notes = i >= 0 ? existing!.slice(i + NOTES_DIVIDER.length).trim() : "";
  return `${botText}\n\n${NOTES_DIVIDER}\n${notes}`.trimEnd() + (notes ? "" : "\n");
}

/** Keep the user's own tags; replace the bot's status tags. */
export function mergeTags(botTags: string[], existing: string[] | null | undefined): string[] {
  const keep = (existing ?? []).filter((t) => !STATUS_TAGS.includes(t) && t !== "bot" && t !== "paper" && t !== "live");
  return Array.from(new Set([...botTags, ...keep]));
}

/** Create or update the journal entry for one bot trade. Best effort: never throws. */
export async function syncBotJournal(admin: any, tradeId: string): Promise<void> {
  try {
    const { data: t } = await admin.from("bot_trades").select("*").eq("id", tradeId).maybeSingle();
    if (!t) return;
    const e = botJournalEntry(t as TradeRow);
    if (!e) return;
    const { data: existing } = await admin.from("trading_journal").select("id, content, tags").eq("bot_trade_id", tradeId).maybeSingle();
    const row = {
      user_id: t.user_id,
      bot_trade_id: tradeId,
      entry_type: "trade",
      symbol: e.symbol,
      content: mergeContent(e.content, existing?.content),
      tags: mergeTags(e.tags, existing?.tags),
      entry_date: e.entry_date,
      updated_at: new Date().toISOString(),
    };
    if (existing) await admin.from("trading_journal").update(row).eq("id", existing.id);
    else {
      const { error } = await admin.from("trading_journal").insert(row);
      // Two runs racing: the unique index rejects the second insert; update instead.
      if (error) await admin.from("trading_journal").update(row).eq("bot_trade_id", tradeId);
    }
  } catch (err) {
    console.warn(`[bot-journal] ${tradeId}:`, (err as Error)?.message ?? err);
  }
}
