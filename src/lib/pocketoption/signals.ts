/**
 * Live pattern signals: what just appeared on the newest finished candle,
 * how it has done before (from the scoreboard), and how it turned out.
 */
import { type Bar, type Dir, type PatternId, detectAt, seriesFor } from "../../../supabase/functions/_shared/patterns/detect";
import { type Outcome, type PatternStat, type Scoreboard, type Verdict, outcomeOf, statFor } from "../../../supabase/functions/_shared/patterns/stats";

export interface Signal {
  /** asset|tf|pattern|dir|candleTime|expiry */
  key: string;
  asset: string;
  /** Candle size in minutes. */
  tf: number;
  pattern: PatternId;
  dir: Dir;
  /** Start time of the candle the pattern completed on (ms). */
  candleTime: number;
  expiry: number;
  entry: number;
  strength: number;
  stat: Pick<PatternStat, "n" | "winRate" | "floor" | "breakEven" | "verdict" | "expectancy"> | null;
  outcome: Outcome | null;
  exit: number | null;
  /** Saved row id (once stored). */
  id?: string;
}

export const signalKey = (s: Pick<Signal, "asset" | "tf" | "pattern" | "dir" | "candleTime" | "expiry">) => `${s.asset}|${s.tf}|${s.pattern}|${s.dir}|${s.candleTime}|${s.expiry}`;

/** Signals on the newest candle in `bars`. */
export function signalsOnLast(asset: string, tf: number, bars: Bar[], board: Scoreboard | null, expiry: number): Signal[] {
  const i = bars.length - 1;
  if (i < 0) return [];
  // Same indicator values as the scoreboard uses, so live signals match its history.
  const found = detectAt(bars, i, seriesFor(bars));
  return found.map((d) => {
    const st = statFor(board, d, expiry);
    const s: Signal = {
      key: "",
      asset,
      tf,
      pattern: d.pattern,
      dir: d.dir,
      candleTime: bars[i].time,
      expiry,
      entry: bars[i].close,
      strength: d.strength,
      stat: st ? { n: st.n, winRate: st.winRate, floor: st.floor, breakEven: st.breakEven, verdict: st.verdict, expectancy: st.expectancy } : null,
      outcome: null,
      exit: null,
    };
    s.key = signalKey(s);
    return s;
  });
}

/** Fill in outcomes for open signals once their expiry candle has closed. */
export function resolveSignals(signals: Signal[], bars: Bar[]): Signal[] {
  if (!bars.length) return signals;
  const index = new Map<number, number>();
  for (let i = 0; i < bars.length; i++) index.set(bars[i].time, i);
  let changed = false;
  const out = signals.map((s) => {
    if (s.outcome) return s;
    const i = index.get(s.candleTime);
    if (i === undefined) return s;
    const o = outcomeOf(bars, i, s.dir, s.expiry, s.tf * 60_000);
    if (!o) return s;
    changed = true;
    return { ...s, outcome: o, exit: bars[i + s.expiry].close };
  });
  return changed ? out : signals;
}

export interface TrackRecord {
  n: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  /** Only signals the scoreboard rated "Has an edge" or "Maybe" when they appeared. */
  rated: { n: number; wins: number; winRate: number };
}

const RATED: Verdict[] = ["edge", "maybe"];

export function trackRecord(signals: Signal[]): TrackRecord {
  const done = signals.filter((s) => s.outcome && s.outcome !== "tie");
  const wins = done.filter((s) => s.outcome === "win").length;
  const rated = done.filter((s) => s.stat && RATED.includes(s.stat.verdict));
  const rWins = rated.filter((s) => s.outcome === "win").length;
  return {
    n: done.length,
    wins,
    losses: done.length - wins,
    ties: signals.filter((s) => s.outcome === "tie").length,
    winRate: done.length ? wins / done.length : 0,
    rated: { n: rated.length, wins: rWins, winRate: rated.length ? rWins / rated.length : 0 },
  };
}

/** Is this signal worth an alert? */
export const worthAlert = (s: Signal, onlyEdge: boolean) => !!s.stat && (s.stat.verdict === "edge" || (!onlyEdge && s.stat.verdict === "maybe"));

/** 0.523 -> "52%" (or "52.3%" with d = 1). */
export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
