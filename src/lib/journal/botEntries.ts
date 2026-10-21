/** Journal entries written by the trading bot. */
export interface MaybeBotEntry {
  bot_trade_id?: string | null;
  tags?: string[] | null;
}

export const isBotEntry = (e: MaybeBotEntry) => !!e.bot_trade_id || !!e.tags?.includes("bot");

export function botLabel(e: MaybeBotEntry): { text: string; live: boolean } | null {
  if (!isBotEntry(e)) return null;
  const live = !!e.tags?.includes("live");
  return { text: live ? "Bot · LIVE" : "Bot · Paper", live };
}

export type SourceFilter = "all" | "bot" | "mine";

export const matchesSource = (e: MaybeBotEntry, f: SourceFilter) => f === "all" || (f === "bot" ? isBotEntry(e) : !isBotEntry(e));
