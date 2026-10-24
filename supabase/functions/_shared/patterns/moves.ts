/**
 * Pattern predictions for buying options on stocks.
 *
 * With an option, being right about direction isn't enough: the stock has
 * to move far enough, soon enough, to beat the option's cost and its daily
 * time decay. So each pattern is judged by one question:
 *
 *   After it appeared, did the stock reach the TARGET (1 average candle
 *   range, "ATR", in the predicted direction) before falling back by the
 *   same amount (the STOP), within the time limit?
 *
 * That hit rate is compared with taking the same trade at a random moment
 * (the baseline). A pattern only "has an edge" when even a cautious
 * estimate of its hit rate beats the baseline by a margin.
 *
 *   same-day: 5-minute candles, 30 minutes (6 candles), never past the close
 *   swing:    daily candles, 5 trading days
 *
 * Stats are pooled over all the symbols watched (more examples), with each
 * symbol's own numbers kept alongside.
 */
import { type Bar, type Dir, type PatternId, PATTERNS, atrSeries, detectAt, seriesFor } from "./detect.ts";
import { winRateFloor } from "./stats.ts";

export type Mode = "sameday" | "swing";

export interface ModeSpec {
  mode: Mode;
  /** Candle size, ms (swing: a trading day; gaps between days are normal). */
  tfMs: number;
  /** Candles the trade may take. */
  horizon: number;
  /** Target and stop, in ATRs of this candle size. */
  target: number;
  stop: number;
  label: string;
}

export const MODES: Record<Mode, ModeSpec> = {
  sameday: { mode: "sameday", tfMs: 5 * 60_000, horizon: 6, target: 1, stop: 1, label: "Same day (5-minute candles, up to 30 minutes)" },
  swing: { mode: "swing", tfMs: 86_400_000, horizon: 5, target: 1, stop: 1, label: "Swing (daily candles, up to 5 trading days)" },
};

export type MoveOutcome = "win" | "loss" | "expired";

/**
 * What a trade entered at the close of candle i would have done.
 * Null when the data has a gap (same-day: also when it would run past the close).
 * If target and stop are both touched inside one candle we can't tell which
 * came first, so it counts as a loss (cautious).
 */
export function moveOutcome(bars: Bar[], i: number, dir: Dir, atr: number, spec: ModeSpec): { o: MoveOutcome; endMove: number; best: number } | null {
  const end = i + spec.horizon;
  if (end >= bars.length || !(atr > 0)) return null;
  if (spec.mode === "sameday" && bars[end].time - bars[i].time !== spec.horizon * spec.tfMs) return null; // gap, or crosses the close
  const entry = bars[i].close;
  const up = dir === "up";
  const target = up ? entry + spec.target * atr : entry - spec.target * atr;
  const stop = up ? entry - spec.stop * atr : entry + spec.stop * atr;
  let best = 0;
  for (let j = i + 1; j <= end; j++) {
    const b = bars[j];
    const fav = up ? b.high - entry : entry - b.low;
    best = Math.max(best, fav / atr);
    const hitT = up ? b.high >= target : b.low <= target;
    const hitS = up ? b.low <= stop : b.high >= stop;
    if (hitS) return { o: "loss", endMove: ((b.close - entry) / atr) * (up ? 1 : -1), best };
    if (hitT) return { o: "win", endMove: ((b.close - entry) / atr) * (up ? 1 : -1), best };
  }
  return { o: "expired", endMove: ((bars[end].close - entry) / atr) * (up ? 1 : -1), best };
}

export type MoveVerdict = "edge" | "maybe" | "none" | "too_few" | "fading";

export interface MoveStat {
  pattern: PatternId;
  dir: Dir;
  n: number;
  wins: number;
  losses: number;
  expired: number;
  /** Reached the target first. */
  winRate: number;
  floor: number;
  /** Same trade at a random moment, same symbols. */
  baseline: number;
  /** Average move at the time limit, in ATRs (in the predicted direction). */
  avgEndMove: number;
  recent: { n: number; winRate: number };
  verdict: MoveVerdict;
  /** Each symbol's own record (with its own random-entry baseline and verdict). */
  perSymbol: Record<string, SymbolStat>;
}

export interface SymbolStat {
  n: number;
  wins: number;
  winRate: number;
  baseline: number;
  recent: { n: number; winRate: number };
  verdict: MoveVerdict;
}

export interface MoveBoard {
  spec: ModeSpec;
  stats: MoveStat[];
  baseline: { up: number; down: number; n: number };
  baselineBySymbol: Record<string, { up: number; down: number; n: number }>;
  bars: number;
  symbols: string[];
}

export const MOVE_MIN_SAMPLES = 30;
/** Must beat the random-entry baseline by this much. */
export const MOVE_MARGIN = 0.03;

export function moveVerdict(wins: number, n: number, baseline: number, recent: { n: number; winRate: number }): MoveVerdict {
  if (n < MOVE_MIN_SAMPLES) return "too_few";
  const rate = wins / n;
  if (rate <= baseline + MOVE_MARGIN) return "none";
  if (recent.n >= 10 && recent.winRate <= baseline) return "fading";
  return winRateFloor(wins, n) > baseline + MOVE_MARGIN && recent.n >= 10 ? "edge" : "maybe";
}

/** Replay every pattern on every symbol's candles. */
export function moveBoard(series: Array<{ symbol: string; bars: Bar[] }>, spec: ModeSpec): MoveBoard {
  type R = { o: MoveOutcome; end: number; t: number; symbol: string };
  const groups = new Map<string, R[]>();
  const base = { up: 0, down: 0, n: 0 };
  const baseBy: Record<string, { up: number; down: number; n: number }> = {};
  let total = 0;
  for (const { symbol, bars } of series) {
    const sb = (baseBy[symbol] = { up: 0, down: 0, n: 0 });
    total += bars.length;
    const s = seriesFor(bars);
    const atr = atrSeries(bars);
    const lastAt = new Map<string, number>();
    for (let i = 0; i < bars.length; i++) {
      // Baseline: a trade at every candle, both ways.
      if (i >= 20) {
        const u = moveOutcome(bars, i, "up", atr[i], spec);
        const d = moveOutcome(bars, i, "down", atr[i], spec);
        if (u && d) {
          base.n++;
          sb.n++;
          if (u.o === "win") {
            base.up++;
            sb.up++;
          }
          if (d.o === "win") {
            base.down++;
            sb.down++;
          }
        }
      }
      for (const det of detectAt(bars, i, s)) {
        const k = `${det.pattern}|${det.dir}`;
        if (i < (lastAt.get(k) ?? -Infinity) + spec.horizon) continue; // no overlapping examples
        const r = moveOutcome(bars, i, det.dir, atr[i], spec);
        if (!r) continue;
        lastAt.set(k, i);
        let g = groups.get(k);
        if (!g) groups.set(k, (g = []));
        g.push({ o: r.o, end: r.endMove, t: bars[i].time, symbol });
      }
    }
  }
  const baseline = { up: base.n ? base.up / base.n : 0, down: base.n ? base.down / base.n : 0, n: base.n };
  const stats: MoveStat[] = [];
  for (const [k, list] of groups) {
    const [pattern, dir] = k.split("|") as [PatternId, Dir];
    list.sort((a, b) => a.t - b.t);
    const n = list.length;
    const wins = list.filter((r) => r.o === "win").length;
    const losses = list.filter((r) => r.o === "loss").length;
    const tail = list.slice(Math.floor(n * 0.7));
    const recent = { n: tail.length, winRate: tail.length ? tail.filter((r) => r.o === "win").length / tail.length : 0 };
    const b = dir === "up" ? baseline.up : baseline.down;
    const perSymbol: MoveStat["perSymbol"] = {};
    for (const sym of new Set(list.map((r) => r.symbol))) {
      const mine = list.filter((r) => r.symbol === sym);
      const w = mine.filter((r) => r.o === "win").length;
      const t = mine.slice(Math.floor(mine.length * 0.7));
      const rec = { n: t.length, winRate: t.length ? t.filter((r) => r.o === "win").length / t.length : 0 };
      const sbl = baseBy[sym];
      const bl = sbl?.n ? (dir === "up" ? sbl.up : sbl.down) / sbl.n : b;
      perSymbol[sym] = { n: mine.length, wins: w, winRate: mine.length ? w / mine.length : 0, baseline: bl, recent: rec, verdict: moveVerdict(w, mine.length, bl, rec) };
    }
    stats.push({
      pattern, dir, n, wins, losses, expired: n - wins - losses,
      winRate: n ? wins / n : 0,
      floor: winRateFloor(wins, n),
      baseline: b,
      avgEndMove: n ? list.reduce((a, r) => a + r.end, 0) / n : 0,
      recent,
      verdict: moveVerdict(wins, n, b, recent),
      perSymbol,
    });
  }
  const order: Record<MoveVerdict, number> = { edge: 4, maybe: 3, fading: 2, none: 1, too_few: 0 };
  stats.sort((a, b) => order[b.verdict] - order[a.verdict] || b.floor - b.baseline - (a.floor - a.baseline));
  const baselineBySymbol: MoveBoard["baselineBySymbol"] = {};
  for (const [k, v] of Object.entries(baseBy)) baselineBySymbol[k] = { up: v.n ? v.up / v.n : 0, down: v.n ? v.down / v.n : 0, n: v.n };
  return { spec, stats, baseline, baselineBySymbol, bars: total, symbols: series.map((x) => x.symbol) };
}

export interface MovePrediction {
  symbol: string;
  mode: Mode;
  dir: Dir;
  /** Close of the candle the patterns finished on (the trade starts here). */
  entry: number;
  /** When that candle closed, ms. */
  at: number;
  /** Deadline for the move, ms (same day: 30 minutes later; swing: ~5 trading days). */
  until: number;
  target: number;
  stop: number;
  atr: number;
  /** Chance of reaching the target first (cautious blend of the evidence). */
  chance: number;
  baseline: number;
  strength: "strong" | "moderate";
  evidence: Array<{ pattern: PatternId; name: string; dir: Dir; winRate: number; n: number; verdict: MoveVerdict; baseline: number; scope: "own" | "all" }>;
  reason: string;
}

/** Calendar time for `n` trading days after `t` (weekends skipped; holidays not known). */
export function addTradingDays(t: number, n: number): number {
  const d = new Date(t);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.getTime();
}

/**
 * A prediction for `symbol` from the patterns on its newest candle, or null.
 * `closeTime` = when that candle closed (same day: candle start + 5 min).
 */
export function predictMove(symbol: string, bars: Bar[], board: MoveBoard | null, closeTime: number): MovePrediction | null {
  if (!board || bars.length < 40) return null;
  const spec = board.spec;
  const i = bars.length - 1;
  const atr = atrSeries(bars)[i];
  if (!(atr > 0)) return null;
  const found = detectAt(bars, i, seriesFor(bars));
  const ev: MovePrediction["evidence"] = [];
  for (const d of found) {
    const st = board.stats.find((s) => s.pattern === d.pattern && s.dir === d.dir);
    if (!st) continue;
    // This stock's own record when it has enough examples (stocks behave differently); otherwise all of them together.
    const own = st.perSymbol[symbol];
    const use = own && own.n >= MOVE_MIN_SAMPLES ? { ...own, scope: "own" as const } : { n: st.n, winRate: st.winRate, verdict: st.verdict, baseline: st.baseline, scope: "all" as const };
    if (use.verdict === "too_few") continue;
    ev.push({ pattern: d.pattern, name: PATTERNS[d.pattern].name, dir: d.dir, winRate: use.winRate, n: use.n, verdict: use.verdict, baseline: use.baseline, scope: use.scope });
  }
  const edges = ev.filter((e) => e.verdict === "edge");
  if (!edges.length) return null;
  const dirs = new Set(edges.map((e) => e.dir));
  if (dirs.size > 1) return null; // proven patterns disagree
  const dir = edges[0].dir;
  if (ev.some((e) => e.dir !== dir && (e.verdict === "edge" || e.verdict === "maybe"))) return null;
  const backing = ev.filter((e) => e.dir === dir && (e.verdict === "edge" || e.verdict === "maybe"));
  // Cautious: the best backing pattern's rate, pulled toward the baseline by its sample size.
  const best = backing.reduce((a, e) => (e.winRate - e.baseline > a.winRate - a.baseline ? e : a), backing[0]);
  const baseline = best.baseline;
  const prior = 40;
  const chance = (best.winRate * best.n + baseline * prior) / (best.n + prior);
  const entry = bars[i].close;
  const up = dir === "up";
  const until = spec.mode === "sameday" ? closeTime + spec.horizon * spec.tfMs : addTradingDays(closeTime, spec.horizon);
  const word = up ? "up" : "down";
  const names = backing.map((e) => e.name).join(" + ");
  return {
    symbol,
    mode: spec.mode,
    dir,
    entry,
    at: closeTime,
    until,
    target: up ? entry + spec.target * atr : entry - spec.target * atr,
    stop: up ? entry - spec.stop * atr : entry + spec.stop * atr,
    atr,
    chance,
    baseline,
    strength: backing.length >= 2 || edges.some((e) => e.winRate - e.baseline > 0.1) ? "strong" : "moderate",
    evidence: backing,
    reason: `${names} → ${word}. After ${best.name}, ${best.scope === "own" ? symbol : "these stocks"} reached the target first ${Math.round(best.winRate * 100)}% of ${best.n} times, vs ${Math.round(baseline * 100)}% for a random entry.`,
  };
}

/**
 * How it turned out, from candles after the prediction. Null while still open.
 * same day: candles that start at or after `at` and end by `until`.
 * swing: the next `horizon` daily candles after the signal day (`at` = that day's candle time).
 */
export function resolveMove(p: Pick<MovePrediction, "dir" | "at" | "until" | "target" | "stop" | "mode">, bars: Bar[], now: number): { o: MoveOutcome; exit: number } | null {
  const up = p.dir === "up";
  const spec = MODES[p.mode];
  const window = spec.mode === "sameday"
    ? bars.filter((b) => b.time >= p.at && b.time + spec.tfMs <= p.until)
    : bars.filter((b) => b.time > p.at).slice(0, spec.horizon);
  for (const b of window) {
    const hitS = up ? b.low <= p.stop : b.high >= p.stop;
    const hitT = up ? b.high >= p.target : b.low <= p.target;
    if (hitS) return { o: "loss", exit: p.stop };
    if (hitT) return { o: "win", exit: p.target };
  }
  const complete = spec.mode === "sameday" ? now >= p.until && window.length > 0 : window.length >= spec.horizon;
  if (!complete) return null;
  return { o: "expired", exit: window[window.length - 1].close };
}
