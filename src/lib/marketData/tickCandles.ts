/** Build fixed-length candles from price ticks (pure, unit-tested). */

export interface TickCandle {
  /** Epoch ms of the candle's start (aligned to the period). */
  start: number;
  open: number;
  high: number;
  low: number;
  close: number;
  ticks: number;
}

/**
 * Add a tick. Returns the candle in progress and, when this tick starts a new
 * period, the candle that just finished (ready to save).
 */
export function addTick(current: TickCandle | null, price: number, now: number, periodMs = 60_000): { candle: TickCandle | null; finished: TickCandle | null } {
  if (!(price > 0) || !Number.isFinite(price)) return { candle: current, finished: null };
  const start = Math.floor(now / periodMs) * periodMs;
  if (current && current.start === start) {
    return {
      candle: { ...current, high: Math.max(current.high, price), low: Math.min(current.low, price), close: price, ticks: current.ticks + 1 },
      finished: null,
    };
  }
  // A late tick from an earlier period is ignored.
  if (current && start < current.start) return { candle: current, finished: null };
  return { candle: { start, open: price, high: price, low: price, close: price, ticks: 1 }, finished: current };
}
