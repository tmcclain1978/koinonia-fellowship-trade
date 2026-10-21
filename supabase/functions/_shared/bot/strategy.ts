/**
 * "Trend pullback" — the bot's entry rules. Pure and deterministic: the same
 * bars always give the same answer, so live, paper and backtest agree.
 *
 * Long only, 5-minute bars, regular session. In plain words:
 *   1. The stock is in an uptrend today: price above VWAP, the fast average
 *      (EMA 9) above the slow one (EMA 21), and the slow one rising.
 *   2. It pulled back recently: in the last few bars a low came down to the
 *      slow average (or RSI cooled off below 45).
 *   3. The pullback held: no close more than half an ATR below the slow average.
 *   4. It's turning back up now: the last completed bar is green, closed above
 *      EMA 9 and above the previous bar's high, with RSI between 50 and 70 and
 *      normal-or-better volume.
 *   5. Not too stretched: price is no more than 2 ATR above VWAP.
 * Stop: just under the pullback low. Target: `rewardRisk` × the risk.
 */
import { ema, rsiSeries, atr, vwap, sma, type Bars } from "../indicator-calc.ts";

export interface Bar {
  t: number; // bar start, epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface StrategyParams {
  emaFast: number;
  emaSlow: number;
  rsiLen: number;
  atrLen: number;
  pullbackBars: number;
  rewardRisk: number;
  minPrice: number;
  /** Minimum average shares per 5-minute bar (liquidity). */
  minAvgVolume: number;
}

export const DEFAULT_PARAMS: StrategyParams = {
  emaFast: 9,
  emaSlow: 21,
  rsiLen: 14,
  atrLen: 14,
  pullbackBars: 6,
  rewardRisk: 2,
  minPrice: 5,
  minAvgVolume: 10_000,
};

export interface Signal {
  symbol: string;
  /** Bar that triggered (start time). */
  barTime: number;
  /** Reference entry (the trigger bar's close). */
  entry: number;
  stop: number;
  target: number;
  /** Entry − stop, per share. */
  risk: number;
  atr: number;
  /** 0-100, for ranking candidates. */
  score: number;
  reasons: string[];
  facts: Record<string, number>;
}

export interface NoSignal {
  symbol: string;
  /** The first rule that failed, in plain words. */
  why: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function toBars(list: Bar[]): Bars {
  return {
    timestamp: list.map((b) => b.t),
    open: list.map((b) => b.o),
    high: list.map((b) => b.h),
    low: list.map((b) => b.l),
    close: list.map((b) => b.c),
    volume: list.map((b) => b.v),
  };
}

/**
 * Check the last bar of `bars` (completed 5-minute regular-session bars,
 * oldest first, at least ~40 of them including the previous day for warm-up).
 */
export function evaluateEntry(symbol: string, bars: Bar[], p: StrategyParams = DEFAULT_PARAMS): Signal | NoSignal {
  const need = Math.max(p.emaSlow + 5, p.atrLen + 2, 25) + p.pullbackBars;
  if (bars.length < need) return { symbol, why: `not enough history (${bars.length} bars)` };
  const b = toBars(bars);
  const i = bars.length - 1;
  const fast = ema(b.close, p.emaFast);
  const slow = ema(b.close, p.emaSlow);
  const rsi = rsiSeries(b.close, p.rsiLen);
  const a = atr(b, p.atrLen);
  const vw = vwap(b).value;
  const avgVol = sma(b.volume, 20);

  const c = b.close[i], o = b.open[i];
  const A = a[i];
  if (![fast[i], slow[i], slow[i - 3], rsi[i], A, vw[i], avgVol[i - 1]].every(Number.isFinite)) return { symbol, why: "indicators not ready" };
  if (c < p.minPrice) return { symbol, why: `price under $${p.minPrice}` };
  if (avgVol[i - 1] < p.minAvgVolume) return { symbol, why: "too thinly traded" };

  // 1. Uptrend today.
  if (!(c > vw[i])) return { symbol, why: "below VWAP" };
  if (!(fast[i] > slow[i])) return { symbol, why: "EMA 9 not above EMA 21" };
  if (!(slow[i] > slow[i - 3])) return { symbol, why: "EMA 21 not rising" };

  // 2. Recent pullback toward the slow average.
  const from = i - p.pullbackBars;
  let pullLow = Infinity, minRsi = Infinity, touched = false, weakest = Infinity;
  for (let k = from; k < i; k++) {
    pullLow = Math.min(pullLow, b.low[k]);
    minRsi = Math.min(minRsi, rsi[k]);
    if (b.low[k] <= slow[k] * 1.001) touched = true;
    weakest = Math.min(weakest, b.close[k] - slow[k]);
  }
  pullLow = Math.min(pullLow, b.low[i]);
  if (!touched && !(minRsi < 45)) return { symbol, why: "no pullback to EMA 21" };

  // 3. Pullback held.
  if (weakest < -0.5 * A) return { symbol, why: "pullback broke below EMA 21" };

  // 4. Turning back up.
  if (!(c > o)) return { symbol, why: "trigger bar not green" };
  if (!(c > fast[i])) return { symbol, why: "close not above EMA 9" };
  if (!(c > b.high[i - 1])) return { symbol, why: "didn't clear the previous bar's high" };
  if (!(rsi[i] >= 50 && rsi[i] <= 70)) return { symbol, why: `RSI ${rsi[i].toFixed(0)} outside 50-70` };
  const volRatio = b.volume[i] / avgVol[i - 1];
  if (volRatio < 1) return { symbol, why: "volume below average" };

  // 5. Not stretched.
  const stretch = (c - vw[i]) / A;
  if (stretch > 2) return { symbol, why: "too far above VWAP" };

  const stop = pullLow - 0.1 * A;
  const risk = c - stop;
  if (risk < 0.25 * A) return { symbol, why: "stop too tight" };
  if (risk > 2.5 * A || risk / c > 0.03) return { symbol, why: "stop too far away" };
  const target = c + p.rewardRisk * risk;

  // Ranking: stronger trend, more volume, room to run, RSI near the middle.
  const trend = Math.min((fast[i] - slow[i]) / A, 1.5) / 1.5; // 0..1
  const vol = Math.min(volRatio, 3) / 3; // 0..1
  const room = 1 - Math.min(Math.max(stretch, 0), 2) / 2; // 0..1
  const rsiFit = 1 - Math.abs(rsi[i] - 60) / 10; // 1 at 60, 0 at 50/70
  const score = Math.round(100 * (0.35 * trend + 0.25 * vol + 0.25 * room + 0.15 * Math.max(rsiFit, 0)));

  return {
    symbol,
    barTime: b.timestamp[i],
    entry: c,
    stop: r2(stop),
    target: r2(target),
    risk,
    atr: A,
    score,
    reasons: [
      "uptrend: above VWAP, EMA 9 > EMA 21, EMA 21 rising",
      touched ? "pulled back to EMA 21" : `RSI cooled to ${minRsi.toFixed(0)}`,
      `turned up: green bar above the prior high, RSI ${rsi[i].toFixed(0)}, volume ${volRatio.toFixed(1)}× average`,
    ],
    facts: {
      close: r2(c), vwap: r2(vw[i]), ema9: r2(fast[i]), ema21: r2(slow[i]), rsi: r2(rsi[i]), atr: r2(A),
      volumeRatio: r2(volRatio), stretchAtr: r2(stretch), pullbackLow: r2(pullLow),
    },
  };
}

export const isSignal = (x: Signal | NoSignal): x is Signal => "entry" in x;
