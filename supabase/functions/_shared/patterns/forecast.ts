/**
 * Next-candle forecast: "the candle from 20:56 to 20:57 will close GREEN,
 * 61%", built from the patterns the engine recognized on the candle that
 * just closed, plus how the last few candle colors have played out before.
 *
 * Each piece of evidence carries its own track record from the saved
 * candles. They are combined into one probability, and a call (CALL/PUT)
 * is only made when that probability beats the payout's break-even AND a
 * pattern with a proven edge points the same way (or two different
 * "Maybe" signals agree with some margin). Otherwise it says "no clear
 * call" and shows which way it leans.
 */
import { type Bar, type Dir, PATTERNS, detectAt, seriesFor } from "./detect.ts";
import { type Outcome, type Scoreboard, type Verdict, MIN_SAMPLES, breakEven, outcomeOf, statFor, verdictFor, winRateFloor } from "./stats.ts";

export interface Evidence {
  kind: "pattern" | "sequence" | "time";
  /** Plain label, e.g. "Hammer" or "Last 3 candles: red, red, green". */
  label: string;
  dir: Dir;
  /** How often a trade in `dir` won after this (0..1). */
  winRate: number;
  n: number;
  verdict: Verdict;
}

export interface Forecast {
  asset: string;
  /** Candle size, minutes. */
  tf: number;
  expiry: number;
  /** Start of the predicted candle (= close of the one the evidence came from), ms. */
  start: number;
  /** When the trade would end, ms. */
  end: number;
  /** Price the trade would start from (close of the last candle). */
  entry: number;
  /** Chance the price ends higher (green), 0..1. */
  pUp: number;
  /** The call, or null when the evidence isn't strong enough. */
  call: Dir | null;
  /** Which way it leans either way. */
  lean: Dir;
  /** max(pUp, 1 - pUp) */
  confidence: number;
  breakEven: number;
  /** strong: a "Has an edge" pattern agrees and none disagrees. */
  strength: "strong" | "moderate" | "none";
  evidence: Evidence[];
  /** One plain sentence. */
  reason: string;
}

const COLOR = (b: Bar) => (b.close > b.open ? "G" : b.close < b.open ? "R" : "D");
const COLOR_WORD: Record<string, string> = { G: "green", R: "red", D: "flat" };

/**
 * After the last `k` candle colors seen now, how did a trade "up" over
 * `expiry` candles do every other time those same colors appeared?
 * (Non-overlapping, gaps skipped.)
 */
export function sequenceEvidence(bars: Bar[], k: number, expiry: number, payout: number, tfMs = 60_000): Evidence | null {
  if (bars.length < k + expiry + 10) return null;
  const colors = bars.map(COLOR);
  const key = colors.slice(-k).join("");
  if (key.includes("D")) return null;
  const results: Outcome[] = [];
  let last = -Infinity;
  const endI = bars.length - 1; // the current occurrence isn't counted
  for (let i = k - 1; i < endI; i++) {
    if (i < last + expiry) continue;
    let match = true;
    for (let j = 0; j < k; j++) if (colors[i - k + 1 + j] !== key[j]) { match = false; break; }
    if (!match) continue;
    // all k candles must be consecutive
    if (bars[i].time - bars[i - k + 1].time !== (k - 1) * tfMs) continue;
    const o = outcomeOf(bars, i, "up", expiry, tfMs);
    if (!o) continue;
    last = i;
    results.push(o);
  }
  const decided = results.filter((o) => o !== "tie");
  const n = decided.length;
  if (n < MIN_SAMPLES) return null;
  const ups = decided.filter((o) => o === "win").length;
  const dir: Dir = ups * 2 >= n ? "up" : "down";
  const wins = dir === "up" ? ups : n - ups;
  const tail = decided.slice(Math.floor(n * 0.7));
  const tailWins = tail.filter((o) => (o === "win") === (dir === "up")).length;
  const be = breakEven(payout);
  return {
    kind: "sequence",
    label: `Last ${k} candles: ${key.split("").map((c) => COLOR_WORD[c]).join(", ")}`,
    dir,
    winRate: wins / n,
    n,
    verdict: verdictFor(wins, n, be, { n: tail.length, winRate: tail.length ? tailWins / tail.length : 0 }),
  };
}

const RANK: Record<Verdict, number> = { edge: 4, maybe: 3, fading: 2, none: 1, too_few: 0 };

/** Chance of "up" implied by one piece of evidence, pulled toward 50% when it has few examples. */
function pUpOf(e: Evidence, prior = 30): number {
  const wins = e.winRate * e.n;
  const p = (wins + prior / 2) / (e.n + prior);
  return e.dir === "up" ? p : 1 - p;
}

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Forecast for the candle that starts when the newest candle in `bars` closes.
 * `board` is the scoreboard for these same candles (pattern track records).
 */
export function forecastNext(asset: string, bars: Bar[], board: Scoreboard | null, opts: { expiry: number; payout: number; tf: number }): Forecast | null {
  const i = bars.length - 1;
  if (i < 0) return null;
  const tfMs = opts.tf * 60_000;
  const be = breakEven(opts.payout);
  const evidence: Evidence[] = [];

  // 1. Patterns that just finished on the last candle, with their record.
  for (const d of detectAt(bars, i, seriesFor(bars))) {
    const st = statFor(board, d, opts.expiry);
    if (!st || st.n < MIN_SAMPLES) continue;
    evidence.push({ kind: "pattern", label: PATTERNS[d.pattern].name, dir: d.dir, winRate: st.winRate, n: st.n, verdict: st.verdict });
  }

  // 2. The best-supported recent color sequence (2 to 5 candles).
  let best: Evidence | null = null;
  for (const k of [2, 3, 4, 5]) {
    const e = sequenceEvidence(bars, k, opts.expiry, opts.payout, tfMs);
    if (!e) continue;
    const score = (x: Evidence) => RANK[x.verdict] * 10 + winRateFloor(Math.round(x.winRate * x.n), x.n);
    if (!best || score(e) > score(best)) best = e;
  }
  if (best) evidence.push(best);

  // Combine: add up the evidence (log-odds), dampened because pieces overlap.
  const usable = evidence.filter((e) => e.verdict !== "too_few");
  const x = usable.length ? usable.reduce((a, e) => a + logit(pUpOf(e)), 0) / Math.sqrt(usable.length) : 0;
  const pUp = sigmoid(x);
  const lean: Dir = pUp >= 0.5 ? "up" : "down";
  const confidence = Math.max(pUp, 1 - pUp);
  const rated = (e: Evidence) => e.verdict === "edge" || e.verdict === "maybe";
  const backing = usable.filter((e) => e.dir === lean && rated(e));
  const edges = backing.filter((e) => e.verdict === "edge");
  const againstEdge = usable.some((e) => e.dir !== lean && e.verdict === "edge");
  // "Maybe" happens by luck fairly often (about 1 in 4 on random prices), so
  // a call needs a proven edge, or two different kinds of evidence agreeing
  // with a margin above break-even.
  const twoKinds = new Set(backing.map((e) => e.kind)).size >= 2 || backing.filter((e) => e.kind === "pattern").length >= 2;
  const enough = edges.length > 0 ? confidence > be : twoKinds && confidence > be + 0.03;
  const call: Dir | null = enough && !againstEdge ? lean : null;
  const strength: Forecast["strength"] = !call ? "none" : edges.length ? "strong" : "moderate";

  const word = lean === "up" ? "green" : "red";
  let reason: string;
  if (!usable.length) reason = "No pattern with enough history showed up on the last candle, so there's nothing to go on. Skip this one.";
  else if (call) reason = `${backing.map((e) => e.label).join(" + ")} point${backing.length === 1 ? "s" : ""} to ${word}; together they won ${Math.round(confidence * 100)}% of the time, above the ${Math.round(be * 1000) / 10}% you need.`;
  else if (againstEdge) reason = "The signals disagree (a pattern with an edge points the other way). Skip this one.";
  else if (!backing.length || (!edges.length && !twoKinds)) reason = `Leans ${word}, but nothing with a proven record backs it. Skip this one.`;
  else reason = `Leans ${word} (${Math.round(confidence * 100)}%), but that's not above the ${Math.round(be * 1000) / 10}% break-even. Skip this one.`;

  const start = bars[i].time + tfMs;
  return { asset, tf: opts.tf, expiry: opts.expiry, start, end: start + opts.expiry * tfMs, entry: bars[i].close, pUp, call, lean, confidence, breakEven: be, strength, evidence, reason };
}

export interface ForecastResult {
  /** green / red / flat over the trade window. */
  actual: "up" | "down" | "flat";
  exit: number;
  /** Did the call (or, with no call, the lean) come true? */
  correct: boolean;
}

/** Once the window has closed: what happened. Null while still open or if data is missing. */
export function resolveForecast(f: Pick<Forecast, "start" | "tf" | "expiry" | "entry" | "call" | "lean">, bars: Bar[]): ForecastResult | null {
  const tfMs = f.tf * 60_000;
  const entryTime = f.start - tfMs;
  let i = -1;
  for (let j = bars.length - 1; j >= 0; j--) {
    if (bars[j].time === entryTime) { i = j; break; }
    if (bars[j].time < entryTime) break;
  }
  if (i < 0) return null;
  const o = outcomeOf(bars, i, f.call ?? f.lean, f.expiry, tfMs);
  if (!o) return null;
  const exit = bars[i + f.expiry].close;
  const actual = exit > bars[i].close ? "up" : exit < bars[i].close ? "down" : "flat";
  return { actual, exit, correct: o === "win" };
}
