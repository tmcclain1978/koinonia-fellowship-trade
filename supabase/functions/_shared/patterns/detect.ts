/**
 * Candle pattern detection for the PocketOption Pattern Engine.
 *
 * Pure functions, no I/O: used by the app (live signals, scoreboard) and
 * by tests. Every pattern says which way it points ("up" = price likely to
 * rise next) and is checked against the trend before it, because most
 * reversal shapes only mean something at the end of a move.
 */

export interface Bar {
  /** Start of the candle, ms. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type Dir = "up" | "down";

export type PatternId =
  | "hammer"
  | "inverted_hammer"
  | "hanging_man"
  | "shooting_star"
  | "doji_reversal"
  | "bullish_marubozu"
  | "bearish_marubozu"
  | "bullish_engulfing"
  | "bearish_engulfing"
  | "piercing_line"
  | "dark_cloud_cover"
  | "bullish_harami"
  | "bearish_harami"
  | "tweezer_bottom"
  | "tweezer_top"
  | "morning_star"
  | "evening_star"
  | "three_white_soldiers"
  | "three_black_crows"
  | "red_streak"
  | "green_streak"
  | "band_bounce_low"
  | "band_bounce_high"
  | "rsi_oversold_turn"
  | "rsi_overbought_turn"
  | "support_bounce"
  | "resistance_rejection"
  | "confluence";

export type PatternFamily = "candle" | "streak" | "indicator" | "level" | "combo";

export interface PatternInfo {
  id: PatternId;
  name: string;
  family: PatternFamily;
  /** Fixed direction, or null when it depends on the case (confluence). */
  dir: Dir | null;
  /** How many candles the shape uses. */
  span: number;
  /** One plain sentence. */
  plain: string;
}

export const PATTERNS: Record<PatternId, PatternInfo> = {
  hammer: { id: "hammer", name: "Hammer", family: "candle", dir: "up", span: 1, plain: "After a drop, a candle with a long tail below and a small body on top: sellers pushed down, buyers pushed back." },
  inverted_hammer: { id: "inverted_hammer", name: "Inverted hammer", family: "candle", dir: "up", span: 1, plain: "After a drop, a small body with a long wick on top: buyers are starting to test higher." },
  hanging_man: { id: "hanging_man", name: "Hanging man", family: "candle", dir: "down", span: 1, plain: "After a rise, a small body with a long tail below: a warning that buyers are tiring." },
  shooting_star: { id: "shooting_star", name: "Shooting star", family: "candle", dir: "down", span: 1, plain: "After a rise, a small body with a long wick on top: price shot up and got pushed back down." },
  doji_reversal: { id: "doji_reversal", name: "Doji after a move", family: "candle", dir: null, span: 1, plain: "Open and close almost equal after a clear move: the move is stalling and may turn." },
  bullish_marubozu: { id: "bullish_marubozu", name: "Strong green candle", family: "candle", dir: "up", span: 1, plain: "A big green candle with almost no wicks: buyers were in control the whole time." },
  bearish_marubozu: { id: "bearish_marubozu", name: "Strong red candle", family: "candle", dir: "down", span: 1, plain: "A big red candle with almost no wicks: sellers were in control the whole time." },
  bullish_engulfing: { id: "bullish_engulfing", name: "Bullish engulfing", family: "candle", dir: "up", span: 2, plain: "After a drop, a green candle whose body covers the whole red body before it." },
  bearish_engulfing: { id: "bearish_engulfing", name: "Bearish engulfing", family: "candle", dir: "down", span: 2, plain: "After a rise, a red candle whose body covers the whole green body before it." },
  piercing_line: { id: "piercing_line", name: "Piercing line", family: "candle", dir: "up", span: 2, plain: "After a red candle, a green one opens lower but closes past the middle of the red one." },
  dark_cloud_cover: { id: "dark_cloud_cover", name: "Dark cloud cover", family: "candle", dir: "down", span: 2, plain: "After a green candle, a red one opens higher but closes below the middle of the green one." },
  bullish_harami: { id: "bullish_harami", name: "Bullish harami", family: "candle", dir: "up", span: 2, plain: "After a big red candle, a small green one sits inside it: selling is slowing down." },
  bearish_harami: { id: "bearish_harami", name: "Bearish harami", family: "candle", dir: "down", span: 2, plain: "After a big green candle, a small red one sits inside it: buying is slowing down." },
  tweezer_bottom: { id: "tweezer_bottom", name: "Tweezer bottom", family: "candle", dir: "up", span: 2, plain: "Two candles in a row hit the same low and bounce: a floor held twice." },
  tweezer_top: { id: "tweezer_top", name: "Tweezer top", family: "candle", dir: "down", span: 2, plain: "Two candles in a row hit the same high and turn down: a ceiling held twice." },
  morning_star: { id: "morning_star", name: "Morning star", family: "candle", dir: "up", span: 3, plain: "Big red, then a small pause candle, then a big green closing well into the red one." },
  evening_star: { id: "evening_star", name: "Evening star", family: "candle", dir: "down", span: 3, plain: "Big green, then a small pause candle, then a big red closing well into the green one." },
  three_white_soldiers: { id: "three_white_soldiers", name: "Three green soldiers", family: "candle", dir: "up", span: 3, plain: "Three solid green candles in a row, each closing higher." },
  three_black_crows: { id: "three_black_crows", name: "Three red crows", family: "candle", dir: "down", span: 3, plain: "Three solid red candles in a row, each closing lower." },
  red_streak: { id: "red_streak", name: "Long red run", family: "streak", dir: "up", span: 5, plain: "Five or more red candles in a row: checks whether price tends to bounce after a long run down." },
  green_streak: { id: "green_streak", name: "Long green run", family: "streak", dir: "down", span: 5, plain: "Five or more green candles in a row: checks whether price tends to pull back after a long run up." },
  band_bounce_low: { id: "band_bounce_low", name: "Bounce off lower band", family: "indicator", dir: "up", span: 2, plain: "Price dipped below the lower Bollinger band, then closed back inside it." },
  band_bounce_high: { id: "band_bounce_high", name: "Turn at upper band", family: "indicator", dir: "down", span: 2, plain: "Price poked above the upper Bollinger band, then closed back inside it." },
  rsi_oversold_turn: { id: "rsi_oversold_turn", name: "RSI turns up from low", family: "indicator", dir: "up", span: 2, plain: "RSI was below 30 (sold hard) and just turned back up." },
  rsi_overbought_turn: { id: "rsi_overbought_turn", name: "RSI turns down from high", family: "indicator", dir: "down", span: 2, plain: "RSI was above 70 (bought hard) and just turned back down." },
  support_bounce: { id: "support_bounce", name: "Bounce at support", family: "level", dir: "up", span: 1, plain: "Price touched a recent low (a floor) and closed back up off it." },
  resistance_rejection: { id: "resistance_rejection", name: "Rejected at resistance", family: "level", dir: "down", span: 1, plain: "Price touched a recent high (a ceiling) and closed back down off it." },
  confluence: { id: "confluence", name: "2+ signals agree", family: "combo", dir: null, span: 1, plain: "Two or more different patterns on the same candle point the same way." },
};

export interface Detection {
  pattern: PatternId;
  dir: Dir;
  /** Index of the candle the pattern completes on (trade after it closes). */
  index: number;
  /** 0..1, how clean the shape is. */
  strength: number;
}

export interface Context {
  /** Direction of the move before this candle. */
  trend: "up" | "down" | "flat";
  /** Average candle range (ATR 14). */
  atr: number;
  rsi: number | null;
  /** Where the close sits in the Bollinger band: 0 = lower, 1 = upper. */
  bandPos: number | null;
}

/* ---- indicator series (one value per bar, null while warming up) ------- */

export function atrSeries(bars: Bar[], n = 14): number[] {
  const out: number[] = [];
  let avg = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const prev = i > 0 ? bars[i - 1].close : b.open;
    const tr = Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev));
    avg = i === 0 ? tr : i < n ? (avg * i + tr) / (i + 1) : (avg * (n - 1) + tr) / n;
    out.push(avg);
  }
  return out;
}

export function rsiSeries(bars: Bar[], n = 14): Array<number | null> {
  const out: Array<number | null> = [];
  let gain = 0;
  let loss = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const ch = bars[i].close - bars[i - 1].close;
    const g = Math.max(ch, 0);
    const l = Math.max(-ch, 0);
    if (i <= n) {
      gain += g / n;
      loss += l / n;
      out.push(i === n ? (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)) : null);
    } else {
      gain = (gain * (n - 1) + g) / n;
      loss = (loss * (n - 1) + l) / n;
      out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
    }
  }
  return out;
}

export function bandSeries(bars: Bar[], n = 20, k = 2): Array<{ mid: number; upper: number; lower: number } | null> {
  const out: Array<{ mid: number; upper: number; lower: number } | null> = [];
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < bars.length; i++) {
    const c = bars[i].close;
    sum += c;
    sumSq += c * c;
    if (i >= n) {
      const old = bars[i - n].close;
      sum -= old;
      sumSq -= old * old;
    }
    if (i < n - 1) {
      out.push(null);
      continue;
    }
    const mid = sum / n;
    const sd = Math.sqrt(Math.max(0, sumSq / n - mid * mid));
    out.push({ mid, upper: mid + k * sd, lower: mid - k * sd });
  }
  return out;
}

/* ---- shape helpers ------------------------------------------------------ */

const body = (b: Bar) => Math.abs(b.close - b.open);
const range = (b: Bar) => b.high - b.low;
const upperWick = (b: Bar) => b.high - Math.max(b.open, b.close);
const lowerWick = (b: Bar) => Math.min(b.open, b.close) - b.low;
const green = (b: Bar) => b.close > b.open;
const red = (b: Bar) => b.close < b.open;
const mid = (b: Bar) => (b.open + b.close) / 2;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Move over the `look` candles before index i, in ATRs. */
function trendBefore(bars: Bar[], i: number, atr: number, look = 6): "up" | "down" | "flat" {
  const a = i - look;
  if (a < 0 || atr <= 0) return "flat";
  const change = bars[i - 1].close - bars[a].close;
  if (change > 0.8 * atr) return "up";
  if (change < -0.8 * atr) return "down";
  return "flat";
}

/** Lowest low / highest high of the `look` candles ending `gap` before i. */
function priorLevels(bars: Bar[], i: number, look = 30, gap = 3): { low: number; high: number } | null {
  const end = i - gap;
  const start = end - look;
  if (start < 0) return null;
  let low = Infinity;
  let high = -Infinity;
  for (let j = start; j < end; j++) {
    low = Math.min(low, bars[j].low);
    high = Math.max(high, bars[j].high);
  }
  return { low, high };
}

export interface Series {
  atr: number[];
  rsi: Array<number | null>;
  band: Array<{ mid: number; upper: number; lower: number } | null>;
}

export function seriesFor(bars: Bar[]): Series {
  return { atr: atrSeries(bars), rsi: rsiSeries(bars), band: bandSeries(bars) };
}

export function contextAt(bars: Bar[], i: number, s: Series): Context {
  const atr = s.atr[i] ?? 0;
  const band = s.band[i];
  const w = band ? band.upper - band.lower : 0;
  return {
    trend: trendBefore(bars, i, atr),
    atr,
    rsi: s.rsi[i] ?? null,
    bandPos: band && w > 0 ? clamp01((bars[i].close - band.lower) / w) : null,
  };
}

/** Candles needed before detection starts (indicators warm up). */
export const WARMUP = 35;

/**
 * Every pattern that completes on candle i (i must be a finished candle).
 * `s` is seriesFor(bars), passed in so a scan over many candles computes it once.
 */
export function detectAt(bars: Bar[], i: number, s: Series): Detection[] {
  if (i < WARMUP || i >= bars.length) return [];
  const out: Detection[] = [];
  const b = bars[i];
  const p = bars[i - 1];
  const q = bars[i - 2];
  const atr = s.atr[i - 1] || s.atr[i];
  if (!(atr > 0)) return out;
  const r = range(b);
  const add = (pattern: PatternId, dir: Dir, strength: number) => out.push({ pattern, dir, index: i, strength: clamp01(strength) });

  // Trend before the pattern starts (1-candle shapes: before this candle; 2-3 candle shapes: before the first one).
  const t1 = trendBefore(bars, i, atr);
  const t2 = trendBefore(bars, i - 1, atr);
  const t3 = trendBefore(bars, i - 2, atr);
  const big = (x: Bar) => body(x) >= 0.6 * atr;
  const small = (x: Bar) => body(x) <= 0.3 * atr;

  /* single candle */
  if (r > 0.5 * atr) {
    const bodyR = body(b) / r;
    const lowR = lowerWick(b) / r;
    const upR = upperWick(b) / r;
    if (bodyR <= 0.35 && lowR >= 0.6 && upR <= 0.15) {
      if (t1 === "down") add("hammer", "up", lowR);
      if (t1 === "up") add("hanging_man", "down", lowR * 0.8);
    }
    if (bodyR <= 0.35 && upR >= 0.6 && lowR <= 0.15) {
      if (t1 === "down") add("inverted_hammer", "up", upR * 0.8);
      if (t1 === "up") add("shooting_star", "down", upR);
    }
    if (bodyR <= 0.08 && t1 !== "flat") add("doji_reversal", t1 === "up" ? "down" : "up", 1 - bodyR * 5);
  }
  if (body(b) >= 1.2 * atr && upperWick(b) + lowerWick(b) <= 0.12 * r) {
    if (green(b)) add("bullish_marubozu", "up", body(b) / (2 * atr));
    if (red(b)) add("bearish_marubozu", "down", body(b) / (2 * atr));
  }

  /* two candles */
  if (red(p) && green(b) && b.open <= p.close && b.close >= p.open && body(b) > body(p) && t2 === "down") add("bullish_engulfing", "up", body(b) / (body(p) + body(b)));
  if (green(p) && red(b) && b.open >= p.close && b.close <= p.open && body(b) > body(p) && t2 === "up") add("bearish_engulfing", "down", body(b) / (body(p) + body(b)));
  if (red(p) && big(p) && green(b) && b.open < p.close && b.close > mid(p) && b.close < p.open && t2 === "down") add("piercing_line", "up", (b.close - p.close) / body(p));
  if (green(p) && big(p) && red(b) && b.open > p.close && b.close < mid(p) && b.close > p.open && t2 === "up") add("dark_cloud_cover", "down", (p.close - b.close) / body(p));
  if (red(p) && big(p) && green(b) && small(b) && b.open >= p.close && b.close <= p.open && t2 === "down") add("bullish_harami", "up", 1 - body(b) / body(p));
  if (green(p) && big(p) && red(b) && small(b) && b.open <= p.close && b.close >= p.open && t2 === "up") add("bearish_harami", "down", 1 - body(b) / body(p));
  const tol = 0.08 * atr;
  if (Math.abs(b.low - p.low) <= tol && red(p) && green(b) && t2 === "down") add("tweezer_bottom", "up", 1 - Math.abs(b.low - p.low) / tol / 2);
  if (Math.abs(b.high - p.high) <= tol && green(p) && red(b) && t2 === "up") add("tweezer_top", "down", 1 - Math.abs(b.high - p.high) / tol / 2);

  /* three candles */
  if (red(q) && big(q) && small(p) && green(b) && big(b) && b.close > mid(q) && t3 === "down") add("morning_star", "up", (b.close - q.close) / body(q));
  if (green(q) && big(q) && small(p) && red(b) && big(b) && b.close < mid(q) && t3 === "up") add("evening_star", "down", (q.close - b.close) / body(q));
  const solid = (x: Bar) => body(x) >= 0.5 * atr && body(x) >= 0.6 * range(x);
  if ([q, p, b].every((x) => green(x) && solid(x)) && p.close > q.close && b.close > p.close && p.open > q.open && b.open > p.open) add("three_white_soldiers", "up", (b.close - q.open) / (3 * atr));
  if ([q, p, b].every((x) => red(x) && solid(x)) && p.close < q.close && b.close < p.close && p.open < q.open && b.open < p.open) add("three_black_crows", "down", (q.open - b.close) / (3 * atr));

  /* streaks: report once, when the run reaches 5 */
  const runOf = (f: (x: Bar) => boolean) => {
    let n = 0;
    for (let j = i; j >= 0 && f(bars[j]); j--) n++;
    return n;
  };
  const reds = runOf(red);
  const greens = runOf(green);
  if (reds === 5) add("red_streak", "up", 0.6);
  if (greens === 5) add("green_streak", "down", 0.6);

  /* indicators */
  const bandP = s.band[i - 1];
  const bandB = s.band[i];
  if (bandP && bandB) {
    if (p.close < bandP.lower && b.close > bandB.lower && green(b)) add("band_bounce_low", "up", (b.close - bandB.lower) / atr);
    if (p.close > bandP.upper && b.close < bandB.upper && red(b)) add("band_bounce_high", "down", (bandB.upper - b.close) / atr);
  }
  const rP = s.rsi[i - 1];
  const rB = s.rsi[i];
  if (rP !== null && rB !== null) {
    if (rP < 30 && rB > rP && green(b)) add("rsi_oversold_turn", "up", (30 - rP) / 30 + 0.3);
    if (rP > 70 && rB < rP && red(b)) add("rsi_overbought_turn", "down", (rP - 70) / 30 + 0.3);
  }

  /* support / resistance from the last 30 candles (not counting the last 3) */
  const lv = priorLevels(bars, i);
  if (lv) {
    const near = 0.25 * atr;
    if (Math.abs(b.low - lv.low) <= near && b.close > lv.low + 0.4 * r && lowerWick(b) >= 0.4 * r) add("support_bounce", "up", 1 - Math.abs(b.low - lv.low) / near / 2);
    if (Math.abs(b.high - lv.high) <= near && b.close < lv.high - 0.4 * r && upperWick(b) >= 0.4 * r) add("resistance_rejection", "down", 1 - Math.abs(b.high - lv.high) / near / 2);
  }

  /* two or more different patterns agreeing */
  for (const dir of ["up", "down"] as const) {
    const agree = out.filter((d) => d.dir === dir);
    const against = out.some((d) => d.dir !== dir);
    if (agree.length >= 2 && !against) add("confluence", dir, Math.min(1, agree.length / 3));
  }
  return out;
}

/** All detections over a candle series (skips the warm-up). */
export function scan(bars: Bar[], from = WARMUP): Detection[] {
  const s = seriesFor(bars);
  const out: Detection[] = [];
  for (let i = Math.max(from, WARMUP); i < bars.length; i++) out.push(...detectAt(bars, i, s));
  return out;
}

/** Combine 1-minute candles into bigger ones (e.g. 5 for 5-minute). Only complete groups. */
export function aggregate(bars: Bar[], minutes: number): Bar[] {
  if (minutes <= 1) return bars;
  const size = minutes * 60_000;
  const out: Bar[] = [];
  let cur: (Bar & { n: number }) | null = null;
  for (const b of bars) {
    const start = Math.floor(b.time / size) * size;
    if (!cur || cur.time !== start) {
      if (cur && cur.n === minutes) out.push(stripN(cur));
      cur = { time: start, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, n: 1 };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume = (cur.volume ?? 0) + (b.volume ?? 0);
      cur.n++;
    }
  }
  if (cur && cur.n === minutes) out.push(stripN(cur));
  return out;
}

function stripN(c: Bar & { n: number }): Bar {
  const { n: _n, ...bar } = c;
  return bar;
}
