// Pure paper-trading account math. NO Deno/external imports, so it is
// importable by the Deno edge function (with .ts) and by vitest (without).
//
// Margin model: a simplified Reg T margin account. Initial requirement is 50%,
// so flat buying power is 2x equity. Positions are valued at average cost for
// the buying-power check (a conservative simplification that avoids fetching a
// live quote for every open position on each order); live marks are used for
// displayed unrealized P&L. This is a realistic trainer, not a bank-grade
// margin engine.

export const INITIAL_MARGIN_RATE = 0.5;

export interface Position {
  qty: number; // signed: + long, - short
  avgCost: number; // per-unit (per-share / per-contract-unit, before multiplier)
  mult: number; // 1 for stock, 100 for a single-leg option
}

export interface Quote {
  bid?: number | null;
  ask?: number | null;
  last?: number | null;
  mark?: number | null;
}

/**
 * Realistic fill price: a buy lifts the ask, a sell hits the bid, falling back
 * to mark then last when a side is missing. Slippage (in basis points) widens
 * against the trader. Returns null if no usable price exists.
 */
export function resolveFillPrice(
  side: "buy" | "sell",
  quote: Quote,
  slippageBps = 0,
): number | null {
  const ask = quote.ask || quote.mark || quote.last || null;
  const bid = quote.bid || quote.mark || quote.last || null;
  const base = side === "buy" ? ask : bid;
  if (!base || base <= 0) return null;
  const slip = base * (slippageBps / 10000);
  return side === "buy" ? base + slip : base - slip;
}

/** Signed notional (can be negative for shorts). */
export function marketValue(qty: number, price: number, mult: number): number {
  return qty * price * mult;
}

/** Absolute exposure used for margin. */
export function notional(qty: number, price: number, mult: number): number {
  return Math.abs(qty) * price * mult;
}

/** Unrealized P&L of a position at the given mark (works for long and short). */
export function unrealizedPnl(pos: Position, mark: number): number {
  return (mark - pos.avgCost) * pos.qty * pos.mult;
}

export interface FillResult {
  qty: number;
  avgCost: number;
  realized: number; // realized P&L produced by this fill
}

/**
 * Apply a fill to a position using signed-quantity average-cost accounting.
 * `deltaQty` is signed: +buy, -sell. Handles open, increase, partial close,
 * full close, and flip (close + reopen in the opposite direction).
 */
export function applyFill(
  pos: Position,
  deltaQty: number,
  fillPrice: number,
  mult: number,
): FillResult {
  const oldQty = pos.qty;
  const oldAvg = pos.avgCost;
  const newQty = oldQty + deltaQty;
  let realized = 0;
  let newAvg = oldAvg;

  if (oldQty === 0) {
    newAvg = fillPrice; // opening a fresh position
  } else if (Math.sign(oldQty) === Math.sign(deltaQty)) {
    // increasing in the same direction -> weighted average cost
    newAvg =
      (Math.abs(oldQty) * oldAvg + Math.abs(deltaQty) * fillPrice) /
      (Math.abs(oldQty) + Math.abs(deltaQty));
  } else {
    // opposite direction: closing some/all, maybe flipping
    const closingQty = Math.min(Math.abs(deltaQty), Math.abs(oldQty));
    const dir = Math.sign(oldQty); // +1 long closed by sell, -1 short closed by buy
    realized = (fillPrice - oldAvg) * closingQty * mult * dir;
    if (Math.abs(deltaQty) > Math.abs(oldQty)) {
      newAvg = fillPrice; // flipped; remainder opens at fill price
    } else if (newQty === 0) {
      newAvg = 0; // fully closed
    } else {
      newAvg = oldAvg; // partial close keeps the average
    }
  }

  return { qty: newQty, avgCost: newAvg, realized };
}

/** Cash effect of a fill: a buy debits cash, a sell credits it. */
export function cashDelta(
  side: "buy" | "sell",
  qty: number,
  fillPrice: number,
  mult: number,
  commission = 0,
): number {
  const gross = qty * fillPrice * mult;
  return side === "buy" ? -(gross + commission) : gross - commission;
}

/** Account equity, valuing positions at avg cost (see header note). */
export function equityAtCost(cash: number, positions: Position[]): number {
  return cash + positions.reduce((s, p) => s + marketValue(p.qty, p.avgCost, p.mult), 0);
}

/** Account equity, valuing positions at live marks (for display/account value). */
export function liveEquity(
  cash: number,
  positions: Array<{ qty: number; mark: number; mult: number }>,
): number {
  return cash + positions.reduce((s, p) => s + marketValue(p.qty, p.mark, p.mult), 0);
}

/** Initial margin tied up by current positions. */
export function marginUsed(positions: Position[], rate = INITIAL_MARGIN_RATE): number {
  return positions.reduce((s, p) => s + notional(p.qty, p.avgCost, p.mult) * rate, 0);
}

/** Flat buying power available for new positions. */
export function buyingPower(
  cash: number,
  positions: Position[],
  rate = INITIAL_MARGIN_RATE,
): number {
  return (equityAtCost(cash, positions) - marginUsed(positions, rate)) / rate;
}

export interface OrderValidation {
  ok: boolean;
  reason: string;
}

/**
 * Validate an order against buying power. Reducing/closing never fails (it
 * frees margin); opening/increasing must leave post-trade equity >= the
 * initial margin required for all resulting positions.
 */
export function validateOrder(
  cash: number,
  existing: Position | null,
  side: "buy" | "sell",
  qty: number,
  fillPrice: number,
  mult: number,
  otherPositions: Position[] = [],
  rate = INITIAL_MARGIN_RATE,
  commission = 0,
): OrderValidation {
  const pos: Position = existing ?? { qty: 0, avgCost: 0, mult };
  const delta = side === "buy" ? qty : -qty;

  // Is this order (at least partly) opening/increasing exposure?
  const increasing = pos.qty === 0 || Math.sign(pos.qty) === Math.sign(delta);
  if (!increasing && Math.abs(delta) <= Math.abs(pos.qty)) {
    return { ok: true, reason: "Reducing/closing position" }; // never blocked
  }

  const fill = applyFill(pos, delta, fillPrice, mult);
  // Cash moves by the actual proceeds/cost only. Realized P&L is a derived
  // metric already reflected in the equity change (closing removes the
  // position's market value and adds proceeds); adding it here would double-count.
  const newCash = cash + cashDelta(side, qty, fillPrice, mult, commission);
  const resulting: Position[] = [
    ...otherPositions,
    { qty: fill.qty, avgCost: fill.avgCost, mult },
  ].filter((p) => p.qty !== 0);

  const equity = equityAtCost(newCash, resulting);
  const required = marginUsed(resulting, rate);
  if (equity + 1e-6 < required) {
    return { ok: false, reason: "Insufficient buying power for this order" };
  }
  return { ok: true, reason: "OK" };
}
