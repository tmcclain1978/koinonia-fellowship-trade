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
import { type BarContext, type Filters, type Trend, NO_FILTERS, failedFilters, indexFor, passes, sameDayContext, swingContext } from "./context.ts";

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
  /** Exit plan time stop: after this many candles, get out if the stock hasn't moved TIME_STOP_MOVE ATRs our way. */
  timeStop: number;
  label: string;
}

export const MODES: Record<Mode, ModeSpec> = {
  sameday: { mode: "sameday", tfMs: 5 * 60_000, horizon: 6, target: 1, stop: 1, timeStop: 3, label: "Same day (5-minute candles, up to 30 minutes)" },
  swing: { mode: "swing", tfMs: 86_400_000, horizon: 5, target: 1, stop: 1, timeStop: 2, label: "Swing (daily candles, up to 5 trading days)" },
};

export type MoveOutcome = "win" | "loss" | "expired";

/** Partial-profit plan: sell half at this share of the way to the target, then move the stop to the entry price. */
export const PARTIAL_AT = 0.6;
/** Time stop: the move (in ATRs, our way) needed by the time-stop candle to stay in. */
export const TIME_STOP_MOVE = 0.3;

/**
 * What a trade entered at the close of candle i would have done.
 * Null when the data has a gap (same-day: also when it would run past the close).
 * If target and stop are both touched inside one candle we can't tell which
 * came first, so it counts as a loss (cautious).
 *
 * `planR`: the result of the exit plan, in units of the stop distance (R):
 * -1 = stopped out before the partial, +0.8 = partial then target, +0.3 =
 * partial then back to entry; time stop = out at the close of candle
 * `timeStop` if the stock hasn't moved TIME_STOP_MOVE ATRs our way by then.
 */
export function moveOutcome(bars: Bar[], i: number, dir: Dir, atr: number, spec: ModeSpec): { o: MoveOutcome; endMove: number; best: number; planR: number } | null {
  const end = i + spec.horizon;
  if (end >= bars.length || !(atr > 0)) return null;
  if (spec.mode === "sameday" && bars[end].time - bars[i].time !== spec.horizon * spec.tfMs) return null; // gap, or crosses the close
  const entry = bars[i].close;
  const up = dir === "up";
  const sgn = up ? 1 : -1;
  const target = entry + sgn * spec.target * atr;
  const stop = entry - sgn * spec.stop * atr;
  const partial = entry + sgn * PARTIAL_AT * spec.target * atr;
  const R = spec.stop * atr;
  let best = 0;
  let o: MoveOutcome | null = null;
  let oEnd = 0;
  let plan: number | null = null;
  let tookPartial = false;
  for (let j = i + 1; j <= end; j++) {
    const b = bars[j];
    const fav = up ? b.high - entry : entry - b.low;
    best = Math.max(best, fav / atr);
    const hitT = up ? b.high >= target : b.low <= target;
    const hitS = up ? b.low <= stop : b.high >= stop;
    const hitP = up ? b.high >= partial : b.low <= partial;
    const backToEntry = up ? b.low <= entry : b.high >= entry;
    if (!o) {
      if (hitS) {
        o = "loss";
        oEnd = ((b.close - entry) / atr) * sgn;
      } else if (hitT) {
        o = "win";
        oEnd = ((b.close - entry) / atr) * sgn;
      }
    }
    if (plan === null) {
      if (!tookPartial) {
        if (hitS) plan = -1;
        else if (hitP) {
          tookPartial = true;
          // Same candle also reached the target: the other half is out there too.
          if (hitT) plan = 0.5 * PARTIAL_AT * (spec.target * atr) / R + 0.5 * (spec.target * atr) / R;
        }
      } else if (backToEntry) plan = (0.5 * PARTIAL_AT * spec.target * atr) / R;
      else if (hitT) plan = 0.5 * PARTIAL_AT * (spec.target * atr) / R + 0.5 * (spec.target * atr) / R;
    }
    // Time stop: no real move by now -> out at this close.
    if (plan === null && !tookPartial && j === i + spec.timeStop && best < TIME_STOP_MOVE) plan = Math.max(-1, ((b.close - entry) * sgn) / R);
    if (o && plan !== null) break;
  }
  const endMove = ((bars[end].close - entry) / atr) * sgn;
  if (plan === null) {
    // Time ran out: the open part is closed at the last price.
    const moveR = (endMove * atr) / R;
    plan = tookPartial ? (0.5 * PARTIAL_AT * spec.target * atr) / R + 0.5 * Math.max(0, moveR) : Math.max(-1, moveR);
  }
  return { o: o ?? "expired", endMove: o ? oEnd : endMove, best, planR: plan };
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
  /** With the partial-profit plan: share of trades that ended in profit, and the average result in R. */
  planWinRate: number;
  planAvgR: number;
  recent: { n: number; winRate: number };
  verdict: MoveVerdict;
  /** Each symbol's own record (with its own random-entry baseline and verdict). */
  perSymbol: Record<string, SymbolStat>;
}

export interface SymbolStat {
  n: number;
  wins: number;
  winRate: number;
  planWinRate: number;
  planAvgR: number;
  baseline: number;
  recent: { n: number; winRate: number };
  verdict: MoveVerdict;
}

export interface MoveBoard {
  spec: ModeSpec;
  /** The filters these stats were computed with. */
  filters: Filters;
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

/** One past trade (pattern or random entry) with what was true at the time. */
export interface MoveRecord {
  symbol: string;
  /** null = random entry (baseline). */
  pattern: PatternId | null;
  dir: Dir;
  t: number;
  o: MoveOutcome;
  end: number;
  planR: number;
  ctx: BarContext;
  market: Trend | null;
  /** Entry price (close of the signal candle). */
  px: number;
}

export interface MoveRecords {
  spec: ModeSpec;
  records: MoveRecord[];
  bars: number;
  symbols: string[];
}

/** Context for every candle of every symbol, plus each stock's index trend at the same time. */
export function contexts(series: Array<{ symbol: string; bars: Bar[] }>, spec: ModeSpec) {
  const ctx: Record<string, BarContext[]> = {};
  const trendAt: Record<string, Map<number, Trend>> = {};
  for (const { symbol, bars } of series) {
    ctx[symbol] = spec.mode === "sameday" ? sameDayContext(bars, spec.target) : swingContext(bars, spec.target);
    trendAt[symbol] = new Map(bars.map((b, i) => [b.time, ctx[symbol][i].trend]));
  }
  const marketAt = (symbol: string, t: number): Trend | null => trendAt[indexFor(symbol)]?.get(t) ?? null;
  return { ctx, marketAt };
}

/** Replay every pattern (and a random entry at every candle) on every symbol's candles, keeping the context. */
export function moveRecords(series: Array<{ symbol: string; bars: Bar[] }>, spec: ModeSpec, contextOnly: string[] = []): MoveRecords {
  const records: MoveRecord[] = [];
  const { ctx, marketAt } = contexts(series, spec);
  let total = 0;
  for (const { symbol, bars } of series) {
    // Index loaded only to judge the market: not replayed.
    if (contextOnly.includes(symbol)) continue;
    total += bars.length;
    const s = seriesFor(bars);
    const atr = atrSeries(bars);
    const lastAt = new Map<string, number>();
    for (let i = 0; i < bars.length; i++) {
      const c = ctx[symbol][i];
      const m = marketAt(symbol, bars[i].time);
      if (i >= 20) {
        for (const dir of ["up", "down"] as Dir[]) {
          const r = moveOutcome(bars, i, dir, atr[i], spec);
          if (r) records.push({ symbol, pattern: null, dir, t: bars[i].time, o: r.o, end: r.endMove, planR: r.planR, ctx: c, market: m, px: bars[i].close });
        }
      }
      for (const det of detectAt(bars, i, s)) {
        const k = `${det.pattern}|${det.dir}`;
        if (i < (lastAt.get(k) ?? -Infinity) + spec.horizon) continue; // no overlapping examples
        const r = moveOutcome(bars, i, det.dir, atr[i], spec);
        if (!r) continue;
        lastAt.set(k, i);
        records.push({ symbol, pattern: det.pattern, dir: det.dir, t: bars[i].time, o: r.o, end: r.endMove, planR: r.planR, ctx: c, market: m, px: bars[i].close });
      }
    }
  }
  return { spec, records, bars: total, symbols: series.map((x) => x.symbol).filter((x) => !contextOnly.includes(x)) };
}

const recentOf = (list: Array<{ o: MoveOutcome }>) => {
  const tail = list.slice(Math.floor(list.length * 0.7));
  return { n: tail.length, winRate: tail.length ? tail.filter((r) => r.o === "win").length / tail.length : 0 };
};

/** Stats from replayed trades, keeping only those that pass `filters` (random entries are filtered the same way, so the comparison stays fair). */
export function boardFrom(rec: MoveRecords, filters: Filters = NO_FILTERS): MoveBoard {
  const spec = rec.spec;
  const f: Filters = spec.mode === "swing" ? { ...filters, lunch: false } : filters;
  const keep = rec.records.filter((r) => passes(r.dir, r.ctx, r.market, f));
  const base = { up: 0, down: 0, nUp: 0, nDown: 0 };
  const baseBy: Record<string, { up: number; down: number; nUp: number; nDown: number }> = {};
  const groups = new Map<string, MoveRecord[]>();
  for (const r of keep) {
    if (r.pattern === null) {
      const sb = (baseBy[r.symbol] ??= { up: 0, down: 0, nUp: 0, nDown: 0 });
      if (r.dir === "up") {
        base.nUp++;
        sb.nUp++;
        if (r.o === "win") {
          base.up++;
          sb.up++;
        }
      } else {
        base.nDown++;
        sb.nDown++;
        if (r.o === "win") {
          base.down++;
          sb.down++;
        }
      }
      continue;
    }
    const k = `${r.pattern}|${r.dir}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(r);
  }
  const baseline = { up: base.nUp ? base.up / base.nUp : 0, down: base.nDown ? base.down / base.nDown : 0, n: Math.max(base.nUp, base.nDown) };
  const stats: MoveStat[] = [];
  for (const [k, list] of groups) {
    const [pattern, dir] = k.split("|") as [PatternId, Dir];
    list.sort((a, b) => a.t - b.t);
    const n = list.length;
    const wins = list.filter((r) => r.o === "win").length;
    const losses = list.filter((r) => r.o === "loss").length;
    const recent = recentOf(list);
    const b = dir === "up" ? baseline.up : baseline.down;
    const perSymbol: MoveStat["perSymbol"] = {};
    for (const sym of new Set(list.map((r) => r.symbol))) {
      const mine = list.filter((r) => r.symbol === sym);
      const w = mine.filter((r) => r.o === "win").length;
      const sbl = baseBy[sym];
      const bl = sbl ? (dir === "up" ? (sbl.nUp ? sbl.up / sbl.nUp : b) : sbl.nDown ? sbl.down / sbl.nDown : b) : b;
      const rec = recentOf(mine);
      perSymbol[sym] = {
        n: mine.length,
        wins: w,
        winRate: mine.length ? w / mine.length : 0,
        planWinRate: mine.length ? mine.filter((r) => r.planR > 0).length / mine.length : 0,
        planAvgR: mine.length ? mine.reduce((a, r) => a + r.planR, 0) / mine.length : 0,
        baseline: bl,
        recent: rec,
        verdict: moveVerdict(w, mine.length, bl, rec),
      };
    }
    stats.push({
      pattern, dir, n, wins, losses, expired: n - wins - losses,
      winRate: n ? wins / n : 0,
      floor: winRateFloor(wins, n),
      baseline: b,
      avgEndMove: n ? list.reduce((a, r) => a + r.end, 0) / n : 0,
      planWinRate: n ? list.filter((r) => r.planR > 0).length / n : 0,
      planAvgR: n ? list.reduce((a, r) => a + r.planR, 0) / n : 0,
      recent,
      verdict: moveVerdict(wins, n, b, recent),
      perSymbol,
    });
  }
  const order: Record<MoveVerdict, number> = { edge: 4, maybe: 3, fading: 2, none: 1, too_few: 0 };
  stats.sort((a, b) => order[b.verdict] - order[a.verdict] || b.floor - b.baseline - (a.floor - a.baseline));
  const baselineBySymbol: MoveBoard["baselineBySymbol"] = {};
  for (const [k, v] of Object.entries(baseBy)) baselineBySymbol[k] = { up: v.nUp ? v.up / v.nUp : 0, down: v.nDown ? v.down / v.nDown : 0, n: Math.max(v.nUp, v.nDown) };
  return { spec, filters: f, stats, baseline, baselineBySymbol, bars: rec.bars, symbols: rec.symbols };
}

/** Replay every pattern on every symbol's candles (no filters unless given). */
export function moveBoard(series: Array<{ symbol: string; bars: Bar[] }>, spec: ModeSpec, filters: Filters = NO_FILTERS): MoveBoard {
  return boardFrom(moveRecords(series, spec), filters);
}

export interface FilterImpact {
  label: string;
  filters: Filters;
  /** All pattern signals that pass. */
  n: number;
  winRate: number;
  planWinRate: number;
  planAvgR: number;
  /** Signals from patterns rated "Has an edge" under these filters. */
  edgeN: number;
  edgeWinRate: number;
}

/** How each filter changes the hit rate of all pattern signals (and of the proven ones). */
export function filterImpact(rec: MoveRecords): FilterImpact[] {
  const only = (k: keyof Filters): Filters => ({ ...NO_FILTERS, [k]: true });
  const sets: Array<[string, Filters]> = [
    ["No filters", NO_FILTERS],
    ["Trend only", only("trend")],
    ["Market only", only("market")],
    ...(rec.spec.mode === "sameday" ? ([["Skip lunch only", only("lunch")]] as Array<[string, Filters]>) : []),
    ["Room to target only", only("room")],
    ["Volume only", only("volume")],
    ["All filters", { trend: true, market: true, lunch: rec.spec.mode === "sameday", room: true, volume: true }],
  ];
  return sets.map(([label, filters]) => {
    const sigs = rec.records.filter((r) => r.pattern !== null && passes(r.dir, r.ctx, r.market, filters));
    const board = boardFrom(rec, filters);
    const proven = new Set(board.stats.filter((s) => s.verdict === "edge").map((s) => `${s.pattern}|${s.dir}`));
    const edgeSigs = sigs.filter((r) => proven.has(`${r.pattern}|${r.dir}`));
    const n = sigs.length;
    return {
      label,
      filters,
      n,
      winRate: n ? sigs.filter((r) => r.o === "win").length / n : 0,
      planWinRate: n ? sigs.filter((r) => r.planR > 0).length / n : 0,
      planAvgR: n ? sigs.reduce((a, r) => a + r.planR, 0) / n : 0,
      edgeN: edgeSigs.length,
      edgeWinRate: edgeSigs.length ? edgeSigs.filter((r) => r.o === "win").length / edgeSigs.length : 0,
    };
  });
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
  evidence: Array<{ pattern: PatternId; name: string; dir: Dir; winRate: number; n: number; verdict: MoveVerdict; baseline: number; scope: "own" | "all"; planWinRate?: number; planAvgR?: number }>;
  reason: string;
  /** Partial-profit plan: sell half here, then move the stop to `entry`. */
  partial?: number;
  /** How the plan did in the past for the best backing pattern. */
  planWinRate?: number;
  planAvgR?: number;
  /** What the market looked like (trend, VWAP side). */
  context?: { trend: Trend; market: Trend | null; aboveVwap: boolean | null; rvol?: number | null; nextLevel?: { price: number; name: string } | null };
}

/** A setup that showed up but was skipped by a filter (shown so you know why). */
export interface Skipped {
  symbol: string;
  mode: Mode;
  dir: Dir;
  at: number;
  names: string;
  reasons: string[];
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
export function predictMove(symbol: string, bars: Bar[], board: MoveBoard | null, closeTime: number, live?: { ctx?: BarContext; market?: Trend | null; onSkip?: (s: Skipped) => void }): MovePrediction | null {
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
    const use = own && own.n >= MOVE_MIN_SAMPLES ? { ...own, scope: "own" as const } : { n: st.n, winRate: st.winRate, verdict: st.verdict, baseline: st.baseline, planWinRate: st.planWinRate, planAvgR: st.planAvgR, scope: "all" as const };
    if (use.verdict === "too_few") continue;
    ev.push({ pattern: d.pattern, name: PATTERNS[d.pattern].name, dir: d.dir, winRate: use.winRate, n: use.n, verdict: use.verdict, baseline: use.baseline, scope: use.scope, planWinRate: use.planWinRate, planAvgR: use.planAvgR });
  }
  const edges = ev.filter((e) => e.verdict === "edge");
  if (!edges.length) return null;
  const dirs = new Set(edges.map((e) => e.dir));
  if (dirs.size > 1) return null; // proven patterns disagree
  const dir = edges[0].dir;
  if (ev.some((e) => e.dir !== dir && (e.verdict === "edge" || e.verdict === "maybe"))) return null;
  const backing = ev.filter((e) => e.dir === dir && (e.verdict === "edge" || e.verdict === "maybe"));
  // The same filters the stats were built with must hold right now.
  const why = failedFilters(dir, live?.ctx, live?.market ?? null, board.filters);
  if (why.length) {
    live?.onSkip?.({ symbol, mode: spec.mode, dir, at: closeTime, names: backing.map((e) => e.name).join(" + "), reasons: why });
    return null;
  }
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
    partial: entry + (up ? 1 : -1) * PARTIAL_AT * spec.target * atr,
    planWinRate: best.planWinRate,
    planAvgR: best.planAvgR,
    context: live?.ctx
      ? { trend: live.ctx.trend, market: live.market ?? null, aboveVwap: live.ctx.vwap === null ? null : entry > live.ctx.vwap, rvol: live.ctx.rvol ?? null, nextLevel: (up ? live.ctx.levelAbove : live.ctx.levelBelow) ?? null }
      : undefined,
    reason: `${names} → ${word}. After ${best.name}, ${best.scope === "own" ? symbol : "these stocks"} reached the target first ${Math.round(best.winRate * 100)}% of ${best.n} times, vs ${Math.round(baseline * 100)}% for a random entry.`,
  };
}

/**
 * How it turned out, from candles after the prediction. Null while still open.
 * same day: candles that start at or after `at` and end by `until`.
 * swing: the next `horizon` daily candles after the signal day (`at` = that day's candle time).
 */
export function resolveMove(p: Pick<MovePrediction, "dir" | "at" | "until" | "target" | "stop" | "mode" | "entry"> & { partial?: number }, bars: Bar[], now: number): { o: MoveOutcome; exit: number; planR: number | null } | null {
  const up = p.dir === "up";
  const spec = MODES[p.mode];
  const window = spec.mode === "sameday"
    ? bars.filter((b) => b.time >= p.at && b.time + spec.tfMs <= p.until)
    : bars.filter((b) => b.time > p.at).slice(0, spec.horizon);
  const R = Math.abs(p.entry - p.stop);
  const T = Math.abs(p.target - p.entry);
  let o: MoveOutcome | null = null;
  let exit = 0;
  let plan: number | null = p.partial === undefined || !(R > 0) ? 0 : null;
  let tookPartial = false;
  let bestFav = 0;
  let k = 0;
  for (const b of window) {
    const hitS = up ? b.low <= p.stop : b.high >= p.stop;
    const hitT = up ? b.high >= p.target : b.low <= p.target;
    if (!o && hitS) {
      o = "loss";
      exit = p.stop;
    } else if (!o && hitT) {
      o = "win";
      exit = p.target;
    }
    if (plan === null && p.partial !== undefined) {
      const hitP = up ? b.high >= p.partial : b.low <= p.partial;
      const back = up ? b.low <= p.entry : b.high >= p.entry;
      const pPart = (0.5 * Math.abs(p.partial - p.entry)) / R;
      if (!tookPartial) {
        if (hitS) plan = -1;
        else if (hitP) {
          tookPartial = true;
          if (hitT) plan = pPart + (0.5 * T) / R;
        }
      } else if (back) plan = pPart;
      else if (hitT) plan = pPart + (0.5 * T) / R;
      bestFav = Math.max(bestFav, (up ? b.high - p.entry : p.entry - b.low) / Math.max(T, 1e-9));
      k++;
      if (plan === null && !tookPartial && k === spec.timeStop && bestFav < TIME_STOP_MOVE) plan = Math.max(-1, ((b.close - p.entry) * (up ? 1 : -1)) / R);
    }
    if (o && plan !== null) break;
  }
  const complete = spec.mode === "sameday" ? now >= p.until && window.length > 0 : window.length >= spec.horizon;
  if (!o && !complete) return null;
  if (plan === null && !complete) return { o: o!, exit, planR: null };
  if (plan === null) {
    const last = window[window.length - 1].close;
    const moveR = ((last - p.entry) * (up ? 1 : -1)) / R;
    plan = tookPartial ? (0.5 * Math.abs(p.partial! - p.entry)) / R + 0.5 * Math.max(0, moveR) : Math.max(-1, moveR);
  }
  return o ? { o, exit, planR: p.partial === undefined ? null : plan } : { o: "expired", exit: window[window.length - 1].close, planR: p.partial === undefined ? null : plan };
}
