// Pure working-order trigger logic. NO Deno/external imports (importable by the
// Deno edge functions with .ts and by vitest without). Given a resting order
// and a current quote, decides whether it fills and at what price, plus the
// trailing-stop ratchet. All money math stays deterministic and testable.

export type OrderType = "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";
export type Side = "buy" | "sell";

export interface WorkingOrder {
  orderType: OrderType;
  side: Side;
  limitPrice?: number | null;
  stopPrice?: number | null; // for trailing, this is the current (ratcheted) stop
  trailAmount?: number | null; // absolute $ trail
  trailPercent?: number | null; // percent trail (e.g. 5 = 5%)
  watermark?: number | null; // highest seen (sell trail) / lowest seen (buy trail)
  stopTriggered?: boolean; // stop_limit: has the stop already converted to a limit
}

export interface QuoteLite {
  bid?: number | null;
  ask?: number | null;
  last?: number | null;
  mark?: number | null;
}

export interface FillDecision {
  fill: boolean;
  fillPrice: number | null;
  stopTriggered: boolean; // for stop_limit bookkeeping
}

/** Reference price for trigger comparisons: last, then mark, then mid. */
export function refPrice(q: QuoteLite): number | null {
  if (q.last && q.last > 0) return q.last;
  if (q.mark && q.mark > 0) return q.mark;
  if (q.bid && q.ask) return (q.bid + q.ask) / 2;
  return null;
}

/** Price a buy would pay (lift the ask), with fallbacks. */
function buyPx(q: QuoteLite): number | null {
  return q.ask || q.mark || q.last || null;
}

/** Price a sell would receive (hit the bid), with fallbacks. */
function sellPx(q: QuoteLite): number | null {
  return q.bid || q.mark || q.last || null;
}

/** Decide whether a resting order fills against the current quote. */
export function shouldFill(order: WorkingOrder, q: QuoteLite): FillDecision {
  const ref = refPrice(q);
  const none: FillDecision = { fill: false, fillPrice: null, stopTriggered: !!order.stopTriggered };
  if (ref == null) return none;

  switch (order.orderType) {
    case "market": {
      const px = order.side === "buy" ? buyPx(q) : sellPx(q);
      return px ? { fill: true, fillPrice: px, stopTriggered: false } : none;
    }
    case "limit":
      return limitFill(order, q);
    case "stop": {
      const hit = order.side === "buy" ? ref >= (order.stopPrice ?? Infinity) : ref <= (order.stopPrice ?? -Infinity);
      if (!hit) return none;
      const px = order.side === "buy" ? buyPx(q) : sellPx(q);
      return px ? { fill: true, fillPrice: px, stopTriggered: true } : none;
    }
    case "trailing_stop": {
      // stopPrice is maintained by nextTrailingStop(); behaves like a stop.
      const hit = order.side === "buy" ? ref >= (order.stopPrice ?? Infinity) : ref <= (order.stopPrice ?? -Infinity);
      if (!hit) return none;
      const px = order.side === "buy" ? buyPx(q) : sellPx(q);
      return px ? { fill: true, fillPrice: px, stopTriggered: true } : none;
    }
    case "stop_limit": {
      const triggered = order.stopTriggered ||
        (order.side === "buy" ? ref >= (order.stopPrice ?? Infinity) : ref <= (order.stopPrice ?? -Infinity));
      if (!triggered) return none;
      // Now behaves as a limit; keep stopTriggered=true so it stays converted.
      const lf = limitFill(order, q);
      return { fill: lf.fill, fillPrice: lf.fillPrice, stopTriggered: true };
    }
    default:
      return none;
  }
}

function limitFill(order: WorkingOrder, q: QuoteLite): FillDecision {
  const limit = order.limitPrice;
  if (limit == null) return { fill: false, fillPrice: null, stopTriggered: !!order.stopTriggered };
  if (order.side === "buy") {
    const px = buyPx(q);
    if (px != null && px <= limit) {
      return { fill: true, fillPrice: Math.min(px, limit), stopTriggered: !!order.stopTriggered };
    }
  } else {
    const px = sellPx(q);
    if (px != null && px >= limit) {
      return { fill: true, fillPrice: Math.max(px, limit), stopTriggered: !!order.stopTriggered };
    }
  }
  return { fill: false, fillPrice: null, stopTriggered: !!order.stopTriggered };
}

export interface TrailingState {
  watermark: number;
  stopPrice: number;
}

/**
 * Ratchet a trailing stop. A sell trailing stop (protecting a long) tracks the
 * highest price and trails below it; the stop only moves up. A buy trailing
 * stop (protecting a short) tracks the lowest price and trails above it; the
 * stop only moves down. Returns null if no reference price is available.
 */
export function nextTrailingStop(order: WorkingOrder, q: QuoteLite): TrailingState | null {
  const ref = refPrice(q);
  if (ref == null) return null;
  const byPct = (base: number, sign: number) =>
    order.trailPercent != null ? base * (1 + (sign * order.trailPercent) / 100) : null;
  const byAmt = (base: number, sign: number) =>
    order.trailAmount != null ? base + sign * order.trailAmount : null;

  if (order.side === "sell") {
    const watermark = Math.max(order.watermark ?? ref, ref);
    const raw = byAmt(watermark, -1) ?? byPct(watermark, -1) ?? order.stopPrice ?? watermark;
    const stopPrice = Math.max(order.stopPrice ?? -Infinity, raw); // ratchet up only
    return { watermark, stopPrice };
  } else {
    const watermark = Math.min(order.watermark ?? ref, ref);
    const raw = byAmt(watermark, +1) ?? byPct(watermark, +1) ?? order.stopPrice ?? watermark;
    const stopPrice = Math.min(order.stopPrice ?? Infinity, raw); // ratchet down only
    return { watermark, stopPrice };
  }
}
