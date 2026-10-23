/**
 * Does a pattern actually work? Replays every time it appeared in the saved
 * candles and checks what a trade in its direction would have done.
 *
 * Trade model (PocketOption fixed-time trade): enter at the close of the
 * candle the pattern completes on, exit `expiry` candles later. Win if price
 * moved the right way, tie if unchanged (stake returned), loss otherwise.
 * A win pays `payout` percent, a loss costs the stake, so you need to win
 * more than 1 / (1 + payout/100) of the time just to break even.
 */
import { type Bar, type Detection, type Dir, type PatternId, PATTERNS, scan } from "./detect.ts";

export type Outcome = "win" | "loss" | "tie";

/** Result of a trade after pattern `d`, or null if the data has a gap or ends too soon. */
export function outcomeOf(bars: Bar[], index: number, dir: Dir, expiry: number, tfMs = 60_000): Outcome | null {
  const exitI = index + expiry;
  if (exitI >= bars.length) return null;
  // Candles missing in between: we can't tell what happened.
  if (bars[exitI].time - bars[index].time !== expiry * tfMs) return null;
  const entry = bars[index].close;
  const exit = bars[exitI].close;
  if (exit === entry) return "tie";
  return (exit > entry) === (dir === "up") ? "win" : "loss";
}

export const breakEven = (payoutPct: number) => 1 / (1 + Math.max(1, payoutPct) / 100);

/**
 * Lowest win rate that is still believable given the sample (Wilson score,
 * 99% one-sided). Strict on purpose: about 100 pattern/expiry pairs are
 * tested per asset, and with a looser bar a few would look good by pure
 * luck even on random prices. With few samples this is far below the raw
 * win rate.
 */
export function winRateFloor(wins: number, n: number, z = 2.326): number {
  if (n <= 0) return 0;
  const p = wins / n;
  const z2 = z * z;
  return Math.max(0, (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n));
}

/**
 * - edge: even the cautious floor beats break-even
 * - maybe: wins more than break-even, but the sample could be luck
 * - none: doesn't beat break-even
 * - too_few: not enough examples yet to say
 * - fading: looked good overall but loses in the most recent stretch
 */
export type Verdict = "edge" | "maybe" | "none" | "too_few" | "fading";

export interface PatternStat {
  pattern: PatternId;
  dir: Dir;
  expiry: number;
  /** Decided trades (wins + losses); ties are left out. */
  n: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  floor: number;
  breakEven: number;
  /** Average result per $1 traded at this payout (e.g. +0.06 = 6 cents). */
  expectancy: number;
  /** The newest 30% of examples on their own: is it still working? */
  recent: { n: number; winRate: number };
  verdict: Verdict;
  /** When it last appeared (ms). */
  lastSeen: number | null;
}

export const MIN_SAMPLES = 20;

export function verdictFor(wins: number, n: number, be: number, recent: { n: number; winRate: number }): Verdict {
  if (n < MIN_SAMPLES) return "too_few";
  const rate = wins / n;
  if (rate <= be) return "none";
  if (recent.n >= 10 && recent.winRate < be) return "fading";
  // "Has an edge" also needs the newest examples (not just the total) to beat break-even.
  return winRateFloor(wins, n) > be && recent.n >= 10 ? "edge" : "maybe";
}

function statFrom(pattern: PatternId, dir: Dir, expiry: number, results: Array<{ o: Outcome; t: number }>, payoutPct: number): PatternStat {
  const decided = results.filter((r) => r.o !== "tie");
  const wins = decided.filter((r) => r.o === "win").length;
  const losses = decided.length - wins;
  const n = decided.length;
  const be = breakEven(payoutPct);
  const cut = Math.floor(decided.length * 0.7);
  const tail = decided.slice(cut);
  const tailWins = tail.filter((r) => r.o === "win").length;
  const recent = { n: tail.length, winRate: tail.length ? tailWins / tail.length : 0 };
  const winRate = n ? wins / n : 0;
  return {
    pattern,
    dir,
    expiry,
    n,
    wins,
    losses,
    ties: results.length - n,
    winRate,
    floor: winRateFloor(wins, n),
    breakEven: be,
    expectancy: n ? winRate * (payoutPct / 100) - (1 - winRate) : 0,
    recent,
    verdict: verdictFor(wins, n, be, recent),
    lastSeen: results.length ? results[results.length - 1].t : null,
  };
}

export interface Scoreboard {
  /** One row per pattern + direction + expiry. */
  stats: PatternStat[];
  detections: Detection[];
  candles: number;
  /** Times each expiry was checked. */
  expiries: number[];
  payout: number;
  /** Baseline: what "always up" / "always down" would have done (to compare against). */
  baseline: Record<number, { up: number; down: number; n: number }>;
}

/** Replay every pattern over `bars` for each expiry. */
export function scoreboard(bars: Bar[], opts: { expiries?: number[]; payout?: number; tfMs?: number } = {}): Scoreboard {
  const expiries = opts.expiries ?? [1, 2, 3, 5];
  const payout = opts.payout ?? 80;
  const tfMs = opts.tfMs ?? 60_000;
  const detections = scan(bars);
  const groups = new Map<string, Array<{ o: Outcome; t: number }>>();
  /** Last counted candle per group: a new example only after the previous trade ended. */
  const lastAt = new Map<string, number>();
  for (const d of detections) {
    for (const e of expiries) {
      const k = `${d.pattern}|${d.dir}|${e}`;
      // Overlapping examples share the same future candles and would count
      // one lucky move several times, making a pattern look surer than it is.
      if (d.index < (lastAt.get(k) ?? -Infinity) + e) continue;
      const o = outcomeOf(bars, d.index, d.dir, e, tfMs);
      if (!o) continue;
      lastAt.set(k, d.index);
      let g = groups.get(k);
      if (!g) groups.set(k, (g = []));
      g.push({ o, t: bars[d.index].time });
    }
  }
  const stats: PatternStat[] = [];
  for (const [k, results] of groups) {
    const [pattern, dir, e] = k.split("|");
    stats.push(statFrom(pattern as PatternId, dir as Dir, Number(e), results, payout));
  }
  stats.sort((a, b) => rank(b) - rank(a));

  const baseline: Scoreboard["baseline"] = {};
  for (const e of expiries) {
    let up = 0;
    let down = 0;
    let n = 0;
    for (let i = 0; i + e < bars.length; i++) {
      const o = outcomeOf(bars, i, "up", e, tfMs);
      if (!o || o === "tie") continue;
      n++;
      if (o === "win") up++;
      else down++;
    }
    baseline[e] = { up: n ? up / n : 0, down: n ? down / n : 0, n };
  }
  return { stats, detections, candles: bars.length, expiries, payout, baseline };
}

const VERDICT_ORDER: Record<Verdict, number> = { edge: 4, maybe: 3, fading: 2, none: 1, too_few: 0 };
const rank = (s: PatternStat) => VERDICT_ORDER[s.verdict] * 10 + s.floor;

/** The stat row for a live signal (same pattern, direction, expiry). */
export function statFor(board: Scoreboard | null, d: { pattern: PatternId; dir: Dir }, expiry: number): PatternStat | null {
  return board?.stats.find((s) => s.pattern === d.pattern && s.dir === d.dir && s.expiry === expiry) ?? null;
}

/** For each pattern, the expiry with the best cautious floor. */
export function bestExpiry(board: Scoreboard): Map<string, PatternStat> {
  const best = new Map<string, PatternStat>();
  for (const s of board.stats) {
    const k = `${s.pattern}|${s.dir}`;
    const cur = best.get(k);
    if (!cur || rank(s) > rank(cur)) best.set(k, s);
  }
  return best;
}

export const patternName = (id: PatternId) => PATTERNS[id]?.name ?? id;

export const VERDICT_TEXT: Record<Verdict, { label: string; plain: string }> = {
  edge: { label: "Has an edge", plain: "Even counting bad luck, it wins more often than you need to break even." },
  maybe: { label: "Maybe", plain: "Wins more than break-even so far, but there aren't enough examples to rule out luck." },
  fading: { label: "Fading", plain: "Worked overall, but loses in the most recent stretch. Be careful." },
  none: { label: "No edge", plain: "Doesn't win often enough to beat the payout. Skip it." },
  too_few: { label: "Too few", plain: `Seen fewer than ${MIN_SAMPLES} times. Load more history to judge it.` },
};
