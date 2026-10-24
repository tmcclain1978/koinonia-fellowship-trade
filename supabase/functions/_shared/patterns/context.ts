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
  /** Nearest key level above / below the close (prior day high/low/close, opening range, round numbers; swing: 20/60-day highs and lows, round numbers). */
  levelAbove?: { price: number; name: string } | null;
  levelBelow?: { price: number; name: string } | null;
  /** Room to reach a 1-ATR target before the next level, each way. */
  roomUp?: boolean;
  roomDown?: boolean;
  /** This candle's volume vs normal (same time of day over the last 10 sessions; swing: last 20 days). */
  rvol?: number | null;
}

export interface Filters {
  /** Only calls when the bigger trend is up, puts when it's down. */
  trend: boolean;
  /** Skip when the index is trending the other way. */
  market: boolean;
  /** Same day: skip 11:30 am - 1:30 pm ET. */
  lunch: boolean;
  /** Skip when a key level sits between the entry and the target. */
  room: boolean;
  /** Require above-normal volume on the signal candle. */
  volume: boolean;
}

export const NO_FILTERS: Filters = { trend: false, market: false, lunch: false, room: false, volume: false };
export const ALL_FILTERS: Filters = { trend: true, market: true, lunch: true, room: true, volume: true };
/** Volume counts as "above normal" from this ratio. */
export const RVOL_MIN = 1.2;
/** A level this close to the entry (in ATRs) doesn't block: price is already at it. */
const LEVEL_BUFFER = 0.15;

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

/** Round-number spacing for a price (SPY ~$580 -> $5, AAPL ~$230 -> $5, under $100 -> $1). */
export const roundStep = (price: number, swing = false) => (price >= 1000 ? (swing ? 50 : 10) : price >= 100 ? (swing ? 10 : 5) : price >= 20 ? (swing ? 5 : 1) : 0.5);

type Level = { price: number; name: string };

/** Nearest level above and below `close`, and whether a target `t` (in ATRs) fits before it each way. */
function roomFor(close: number, atr: number, levels: Level[], t: number) {
  let above: Level | null = null;
  let below: Level | null = null;
  for (const l of levels) {
    if (!Number.isFinite(l.price)) continue;
    if (l.price > close + LEVEL_BUFFER * atr && (!above || l.price < above.price)) above = l;
    if (l.price < close - LEVEL_BUFFER * atr && (!below || l.price > below.price)) below = l;
  }
  return {
    levelAbove: above,
    levelBelow: below,
    roomUp: !above || !(atr > 0) || above.price >= close + t * atr,
    roomDown: !below || !(atr > 0) || below.price <= close - t * atr,
  };
}

/** Context for every candle of a same-day (5-minute) series. `target` = target size in ATRs. */
export function sameDayContext(bars: Bar[], target = 1): BarContext[] {
  const slow = ema(bars.map((b) => b.close), 72); // ~6 hours of 5-minute candles: the hourly trend
  const atr = atrOf(bars);
  const out: BarContext[] = [];
  let day = "";
  let pv = 0;
  let vol = 0;
  // Prior session's high/low/close, this session's opening range (first 15 minutes).
  let prev: { high: number; low: number; close: number } | null = null;
  let cur: { high: number; low: number; close: number } | null = null;
  let orHigh = -Infinity;
  let orLow = Infinity;
  let barsToday = 0;
  // Volume at each minute of the day over the last 10 sessions.
  const volByMinute = new Map<number, number[]>();
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const { day: d, minute } = etParts(b.time);
    if (d !== day) {
      if (cur) prev = cur;
      cur = null;
      day = d;
      pv = 0;
      vol = 0;
      orHigh = -Infinity;
      orLow = Infinity;
      barsToday = 0;
    }
    barsToday++;
    cur = cur ? { high: Math.max(cur.high, b.high), low: Math.min(cur.low, b.low), close: b.close } : { high: b.high, low: b.low, close: b.close };
    if (barsToday <= 3) {
      orHigh = Math.max(orHigh, b.high);
      orLow = Math.min(orLow, b.low);
    }
    const v = b.volume && b.volume > 0 ? b.volume : 1;
    pv += ((b.high + b.low + b.close) / 3) * v;
    vol += v;
    const levels: Level[] = [];
    if (prev) levels.push({ price: prev.high, name: "yesterday's high" }, { price: prev.low, name: "yesterday's low" }, { price: prev.close, name: "yesterday's close" });
    if (barsToday > 3) levels.push({ price: orHigh, name: "opening-range high" }, { price: orLow, name: "opening-range low" });
    const step = roundStep(b.close);
    levels.push({ price: Math.ceil(b.close / step) * step, name: `round number` }, { price: Math.floor(b.close / step) * step, name: `round number` });
    const past = volByMinute.get(minute) ?? [];
    const rvol = b.volume && past.length >= 3 ? b.volume / (past.reduce((a, x) => a + x, 0) / past.length) : null;
    if (b.volume && b.volume > 0) {
      past.push(b.volume);
      if (past.length > 10) past.shift();
      volByMinute.set(minute, past);
    }
    out.push({ trend: bigTrend(b.close, slow[i], i >= 12 ? slow[i - 12] : null, atr[i]), vwap: pv / vol, window: windowAt(b.time), rvol, ...roomFor(b.close, atr[i], levels, target) });
  }
  return out;
}

/** Context for every candle of a daily series. */
export function swingContext(bars: Bar[], target = 1): BarContext[] {
  const s50 = sma(bars.map((b) => b.close), 50);
  const atr = atrOf(bars);
  return bars.map((b, i) => {
    const a = s50[i];
    const before = i >= 5 ? s50[i - 5] : null;
    const levels: Level[] = [];
    const hl = (n: number, name: string) => {
      if (i < n) return;
      let h = -Infinity;
      let l = Infinity;
      for (let j = i - n; j < i; j++) {
        h = Math.max(h, bars[j].high);
        l = Math.min(l, bars[j].low);
      }
      levels.push({ price: h, name: `${name} high` }, { price: l, name: `${name} low` });
    };
    hl(20, "20-day");
    hl(60, "60-day");
    const step = roundStep(b.close, true);
    levels.push({ price: Math.ceil(b.close / step) * step, name: "round number" }, { price: Math.floor(b.close / step) * step, name: "round number" });
    let rvol: number | null = null;
    if (i >= 20 && b.volume) {
      let sum = 0;
      for (let j = i - 20; j < i; j++) sum += bars[j].volume ?? 0;
      rvol = sum > 0 ? b.volume / (sum / 20) : null;
    }
    return { trend: a === null ? "flat" : bigTrend(b.close, a, before, atr[i]), vwap: null, window: null, rvol, ...roomFor(b.close, atr[i], levels, target) };
  });
}

/** Does a trade in `dir` pass the chosen filters? `market` = the index's trend at the same time (null if unknown). */
export function passes(dir: Dir, ctx: BarContext | undefined, market: Trend | null, f: Filters): boolean {
  if (f.trend && ctx && ctx.trend !== dir) return false;
  if (f.market && market && market !== "flat" && market !== dir) return false;
  if (f.lunch && ctx?.window === "lunch") return false;
  if (f.room && ctx && (dir === "up" ? ctx.roomUp === false : ctx.roomDown === false)) return false;
  if (f.volume && ctx && ctx.rvol !== undefined && ctx.rvol !== null && ctx.rvol < RVOL_MIN) return false;
  return true;
}

/** Which filters a trade in `dir` fails, in plain words (for showing why a setup was skipped). */
export function failedFilters(dir: Dir, ctx: BarContext | undefined, market: Trend | null, f: Filters): string[] {
  const out: string[] = [];
  const word = dir === "up" ? "up" : "down";
  if (f.trend && ctx && ctx.trend !== dir) out.push(`the bigger trend isn't ${word}`);
  if (f.market && market && market !== "flat" && market !== dir) out.push(`the market is trending the other way`);
  if (f.lunch && ctx?.window === "lunch") out.push("it's the lunch lull (11:30-1:30)");
  if (f.room && ctx && (dir === "up" ? ctx.roomUp === false : ctx.roomDown === false)) {
    const l = dir === "up" ? ctx.levelAbove : ctx.levelBelow;
    out.push(`${l ? `${l.name} ($${l.price.toFixed(2)})` : "a key level"} is in the way of the target`);
  }
  if (f.volume && ctx && ctx.rvol !== undefined && ctx.rvol !== null && ctx.rvol < RVOL_MIN) out.push(`volume is only ${ctx.rvol.toFixed(1)}x normal`);
  return out;
}
