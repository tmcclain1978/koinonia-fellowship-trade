/**
 * Market context for each candle, used to keep only the signals that trade
 * WITH the market:
 *
 *   trend   the BIGGER trend: same day, the ~6-hour average (72 five-minute
 *           candles) rising and price not more than 1 ATR below it (falling /
 *           not more than 1 ATR above for puts). Swing: the 50-day average,
 *           same rule. This keeps "buy the dip in an uptrend" setups (a dip
 *           makes the short-term trend point down, so judging by that would
 *           throw out every reversal pattern).
 *   market  the index the stock moves with (QQQ for TSLA/AAPL/NVDA/SPY,
 *           SPY for QQQ) isn't trending the other way.
 *   window  time of day (same day): open, morning, lunch, afternoon, close.
 */
import type { Bar, Dir } from "./detect.ts";

export type Trend = "up" | "down" | "flat";
export type TimeWindow = "open" | "morning" | "lunch" | "afternoon" | "close";

export interface BarContext {
  trend: Trend;
  /** Same day only: close vs the session's VWAP. */
  vwap: number | null;
  /** Same day only. */
  window: TimeWindow | null;
}

export interface Filters {
  /** Only calls when the bigger trend is up, puts when it's down. */
  trend: boolean;
  /** Skip when the index is trending the other way. */
  market: boolean;
  /** Same day: skip 11:30 am - 1:30 pm ET. */
  lunch: boolean;
}

export const NO_FILTERS: Filters = { trend: false, market: false, lunch: false };
export const ALL_FILTERS: Filters = { trend: true, market: true, lunch: true };

/** The index a stock is checked against. */
export const indexFor = (symbol: string) => (symbol === "QQQ" ? "SPY" : "QQQ");

const etFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
function etParts(t: number): { day: string; minute: number } {
  const p = Object.fromEntries(etFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minute: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

/** Time-of-day window for a 5-minute candle (by when it closes). */
export function windowAt(candleStart: number): TimeWindow {
  const m = etParts(candleStart + 5 * 60_000).minute;
  if (m < 9 * 60 + 45) return "open";
  if (m < 11 * 60 + 30) return "morning";
  if (m < 13 * 60 + 30) return "lunch";
  if (m < 15 * 60 + 30) return "afternoon";
  return "close";
}

function ema(values: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let e = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    e = i === 0 ? values[0] : values[i] * k + e * (1 - k);
    out.push(e);
  }
  return out;
}

function sma(values: number[], n: number): Array<number | null> {
  const out: Array<number | null> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}

function atrOf(bars: Bar[], n = 14): number[] {
  const out: number[] = [];
  let a = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const prev = i ? bars[i - 1].close : b.open;
    const tr = Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev));
    a = i === 0 ? tr : i < n ? (a * i + tr) / (i + 1) : (a * (n - 1) + tr) / n;
    out.push(a);
  }
  return out;
}

/** up / down / flat from a slow average's slope and how far price is from it. */
function bigTrend(close: number, avg: number, avgBefore: number | null, atr: number): Trend {
  if (avgBefore === null || !(atr > 0)) return "flat";
  if (avg > avgBefore && close > avg - atr) return "up";
  if (avg < avgBefore && close < avg + atr) return "down";
  return "flat";
}

/** Context for every candle of a same-day (5-minute) series. */
export function sameDayContext(bars: Bar[]): BarContext[] {
  const slow = ema(bars.map((b) => b.close), 72); // ~6 hours of 5-minute candles: the hourly trend
  const atr = atrOf(bars);
  const out: BarContext[] = [];
  let day = "";
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const d = etParts(b.time).day;
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    const v = b.volume && b.volume > 0 ? b.volume : 1;
    pv += ((b.high + b.low + b.close) / 3) * v;
    vol += v;
    out.push({ trend: bigTrend(b.close, slow[i], i >= 12 ? slow[i - 12] : null, atr[i]), vwap: pv / vol, window: windowAt(b.time) });
  }
  return out;
}

/** Context for every candle of a daily series. */
export function swingContext(bars: Bar[]): BarContext[] {
  const s50 = sma(bars.map((b) => b.close), 50);
  const atr = atrOf(bars);
  return bars.map((b, i) => {
    const a = s50[i];
    const before = i >= 5 ? s50[i - 5] : null;
    return { trend: a === null ? "flat" : bigTrend(b.close, a, before, atr[i]), vwap: null, window: null };
  });
}

/** Does a trade in `dir` pass the chosen filters? `market` = the index's trend at the same time (null if unknown). */
export function passes(dir: Dir, ctx: BarContext | undefined, market: Trend | null, f: Filters): boolean {
  if (f.trend && ctx && ctx.trend !== dir) return false;
  if (f.market && market && market !== "flat" && market !== dir) return false;
  if (f.lunch && ctx?.window === "lunch") return false;
  return true;
}

/** Which filters a trade in `dir` fails, in plain words (for showing why a setup was skipped). */
export function failedFilters(dir: Dir, ctx: BarContext | undefined, market: Trend | null, f: Filters): string[] {
  const out: string[] = [];
  const word = dir === "up" ? "up" : "down";
  if (f.trend && ctx && ctx.trend !== dir) out.push(`the bigger trend isn't ${word}`);
  if (f.market && market && market !== "flat" && market !== dir) out.push(`the market is trending the other way`);
  if (f.lunch && ctx?.window === "lunch") out.push("it's the lunch lull (11:30-1:30)");
  return out;
}
