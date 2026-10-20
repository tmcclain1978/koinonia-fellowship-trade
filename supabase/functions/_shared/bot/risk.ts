/**
 * Position sizing, entry gates and exit rules. Pure.
 */

export interface RiskSettings {
  /** Percent of equity risked per trade (entry→stop), e.g. 0.5. */
  riskPerTradePct: number;
  /** Max dollars in one position. */
  maxPositionDollars: number;
  maxOpenPositions: number;
  maxTradesPerDay: number;
  /** Dollars; new entries stop once today's P&L reaches −this. */
  maxDailyLoss: number;
  /** Block new day trades when under $25k with 3 in the last 5 days. */
  pdtGuard: boolean;
  /** Move the stop to the entry price once the trade is up 1R. */
  breakevenAt1R: boolean;
}

export interface SizeResult {
  qty: number;
  /** Why the size is what it is (the tightest limit). */
  limitedBy: "risk" | "max_position" | "buying_power";
  dollarRisk: number;
}

/** Shares to buy: risk-based, capped by the position limit and buying power. Whole shares. */
export function sizePosition(equity: number, buyingPower: number, entry: number, stop: number, s: RiskSettings): SizeResult {
  const perShare = entry - stop;
  if (!(perShare > 0) || !(entry > 0)) return { qty: 0, limitedBy: "risk", dollarRisk: 0 };
  const byRisk = Math.floor((equity * (s.riskPerTradePct / 100)) / perShare);
  const byMax = Math.floor(s.maxPositionDollars / entry);
  const byBp = Math.floor(Math.max(buyingPower, 0) / entry);
  const qty = Math.max(0, Math.min(byRisk, byMax, byBp));
  const limitedBy = qty === byRisk ? "risk" : qty === byMax ? "max_position" : "buying_power";
  return { qty, limitedBy, dollarRisk: qty * perShare };
}

export interface GateState {
  /** Today's realized + unrealized P&L from bot trades, dollars. */
  todayPnl: number;
  tradesToday: number;
  openPositions: number;
  /** Symbols already entered today (one entry per symbol per day). */
  symbolsTradedToday: Set<string>;
  equity: number;
  /** Bot day trades (opened and closed the same day) in the last 5 trading days. */
  dayTradesLast5: number;
}

export interface Gate {
  ok: boolean;
  reason: string;
}

/** Account-level checks before looking for any new trade. */
export function accountGate(st: GateState, s: RiskSettings): Gate {
  if (st.todayPnl <= -Math.abs(s.maxDailyLoss)) return { ok: false, reason: `daily loss limit reached ($${st.todayPnl.toFixed(2)})` };
  if (st.tradesToday >= s.maxTradesPerDay) return { ok: false, reason: `${st.tradesToday} trades today (limit ${s.maxTradesPerDay})` };
  if (st.openPositions >= s.maxOpenPositions) return { ok: false, reason: `${st.openPositions} open positions (limit ${s.maxOpenPositions})` };
  // Every bot trade is a day trade (it closes by the end of the day).
  if (s.pdtGuard && st.equity < 25_000 && st.dayTradesLast5 >= 3) {
    return { ok: false, reason: "pattern-day-trader guard: 3 day trades in the last 5 days with under $25k" };
  }
  return { ok: true, reason: "ok" };
}

export function symbolGate(symbol: string, st: GateState): Gate {
  if (st.symbolsTradedToday.has(symbol)) return { ok: false, reason: "already traded today" };
  return { ok: true, reason: "ok" };
}

/**
 * The live price must still be close to the signal. Buying well above the
 * trigger (chasing) or below the stop makes the trade a different trade.
 */
export function entryPriceCheck(signal: { entry: number; stop: number; risk: number }, ask: number): Gate {
  if (!(ask > 0)) return { ok: false, reason: "no live price" };
  if (ask <= signal.stop) return { ok: false, reason: "price already below the stop" };
  if (ask > signal.entry + 0.5 * signal.risk) return { ok: false, reason: `price ran away (${ask.toFixed(2)} vs signal ${signal.entry.toFixed(2)})` };
  return { ok: true, reason: "ok" };
}

/* ----------------------------------------------------------------------------
 * Exits
 * ------------------------------------------------------------------------- */

export interface OpenTrade {
  entryPrice: number;
  stop: number;
  target: number;
  /** Stop at entry (risk 1R) — fixed when the trade opens. */
  initialStop: number;
}

export interface PriceWindow {
  /** High and low traded since the last check (1-minute bars), and the latest price. */
  high: number;
  low: number;
  last: number;
  /** First price of the window (for gaps through the stop). */
  open: number;
}

export type ExitDecision =
  | { action: "hold" }
  | { action: "move_stop"; stop: number; reason: string }
  | { action: "exit"; reason: "stop" | "target" | "end_of_day" | "kill_switch"; price: number };

/**
 * Decide what to do with an open long trade. When a window touched both the
 * stop and the target, the stop is assumed first (the cautious reading).
 * `price` on an exit is the expected fill for paper trading.
 */
export function exitDecision(t: OpenTrade, w: PriceWindow, opts: { flatten: boolean; breakevenAt1R: boolean }): ExitDecision {
  if (w.low <= t.stop) return { action: "exit", reason: "stop", price: Math.min(t.stop, w.open) };
  if (w.high >= t.target) return { action: "exit", reason: "target", price: Math.max(t.target, w.open) };
  if (opts.flatten) return { action: "exit", reason: "end_of_day", price: w.last };
  const oneR = t.entryPrice + (t.entryPrice - t.initialStop);
  // Break-even stop, rounded UP to the cent (so it really is at/above entry and
  // the move happens once, not again every minute).
  const breakeven = Math.ceil(t.entryPrice * 100 - 1e-6) / 100;
  if (opts.breakevenAt1R && t.stop < breakeven && w.high >= oneR) {
    return { action: "move_stop", stop: breakeven, reason: "up 1R: stop moved to the entry price" };
  }
  return { action: "hold" };
}

/** Paper fill with slippage: buys pay up, sells give up, by `bps` basis points. */
export function slip(price: number, side: "buy" | "sell", bps: number) {
  const f = bps / 10_000;
  return Math.round(price * (side === "buy" ? 1 + f : 1 - f) * 10_000) / 10_000;
}
