/**
 * Pure technical-indicator math.
 *
 * Every function takes plain arrays and returns arrays of the same length.
 * Bars without enough history are NaN (the chart registry converts NaN to
 * "no value" so lines start where the indicator becomes valid).
 *
 * Conventions follow the standard published definitions (Wilder for RSI/ATR/ADX,
 * TradingView defaults for parameters) so values can be checked against other
 * platforms.
 */

export interface Bars {
  timestamp: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

export type Series = number[];

const nanArray = (n: number): Series => new Array(n).fill(NaN);
const isNum = (v: number) => Number.isFinite(v);

/* ----------------------------------------------------------------------------
 * Building blocks
 * ------------------------------------------------------------------------- */

/** Simple moving average; skips leading NaNs in the source. */
export function sma(src: Series, period: number): Series {
  const out = nanArray(src.length);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!isNum(v)) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += v;
    count++;
    if (count > period) {
      sum -= src[i - period];
      count = period;
    }
    if (count === period) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average seeded with the SMA of the first `period` valid values. */
export function ema(src: Series, period: number): Series {
  const out = nanArray(src.length);
  const k = 2 / (period + 1);
  let prev = NaN;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!isNum(v)) continue;
    if (!isNum(prev)) {
      seedSum += v;
      seedCount++;
      if (seedCount === period) {
        prev = seedSum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's smoothing (RMA), seeded with an SMA. Used by RSI, ATR, ADX. */
export function rma(src: Series, period: number): Series {
  const out = nanArray(src.length);
  let prev = NaN;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!isNum(v)) continue;
    if (!isNum(prev)) {
      seedSum += v;
      seedCount++;
      if (seedCount === period) {
        prev = seedSum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = (prev * (period - 1) + v) / period;
    out[i] = prev;
  }
  return out;
}

/** Linearly weighted moving average. */
export function wma(src: Series, period: number): Series {
  const out = nanArray(src.length);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < src.length; i++) {
    let acc = 0;
    let ok = true;
    for (let j = 0; j < period; j++) {
      const v = src[i - j];
      if (!isNum(v)) {
        ok = false;
        break;
      }
      acc += v * (period - j);
    }
    if (ok) out[i] = acc / denom;
  }
  return out;
}

export function rollingMax(src: Series, period: number): Series {
  const out = nanArray(src.length);
  for (let i = period - 1; i < src.length; i++) {
    let m = -Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.max(m, src[j]);
    if (isNum(m)) out[i] = m;
  }
  return out;
}

export function rollingMin(src: Series, period: number): Series {
  const out = nanArray(src.length);
  for (let i = period - 1; i < src.length; i++) {
    let m = Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.min(m, src[j]);
    if (isNum(m)) out[i] = m;
  }
  return out;
}

/** Population standard deviation over a rolling window (matches Bollinger Bands). */
export function stdev(src: Series, period: number): Series {
  const mean = sma(src, period);
  const out = nanArray(src.length);
  for (let i = period - 1; i < src.length; i++) {
    if (!isNum(mean[i])) continue;
    let acc = 0;
    for (let j = i - period + 1; j <= i; j++) acc += (src[j] - mean[i]) ** 2;
    out[i] = Math.sqrt(acc / period);
  }
  return out;
}

/** Rate of change in percent over `period` bars. */
export function roc(src: Series, period: number): Series {
  return src.map((v, i) =>
    i >= period && isNum(src[i - period]) && src[i - period] !== 0
      ? ((v - src[i - period]) / src[i - period]) * 100
      : NaN,
  );
}

export function trueRange(b: Bars): Series {
  return b.close.map((_, i) => {
    const hl = b.high[i] - b.low[i];
    if (i === 0) return hl;
    const pc = b.close[i - 1];
    return Math.max(hl, Math.abs(b.high[i] - pc), Math.abs(b.low[i] - pc));
  });
}

export const hlc3 = (b: Bars): Series => b.close.map((c, i) => (b.high[i] + b.low[i] + c) / 3);

export function rsiSeries(src: Series, period: number): Series {
  const gains = src.map((v, i) => (i === 0 ? NaN : Math.max(v - src[i - 1], 0)));
  const losses = src.map((v, i) => (i === 0 ? NaN : Math.max(src[i - 1] - v, 0)));
  const ag = rma(gains, period);
  const al = rma(losses, period);
  return ag.map((g, i) => {
    if (!isNum(g) || !isNum(al[i])) return NaN;
    if (al[i] === 0) return g === 0 ? 50 : 100;
    return 100 - 100 / (1 + g / al[i]);
  });
}

/** Least-squares line fit over the trailing window ending at each bar. */
function linregWindow(src: Series, period: number) {
  const value = nanArray(src.length);
  const slope = nanArray(src.length);
  const r2 = nanArray(src.length);
  const xMean = (period - 1) / 2;
  let sxx = 0;
  for (let x = 0; x < period; x++) sxx += (x - xMean) ** 2;
  for (let i = period - 1; i < src.length; i++) {
    let yMean = 0;
    for (let x = 0; x < period; x++) yMean += src[i - period + 1 + x];
    yMean /= period;
    if (!isNum(yMean)) continue;
    let sxy = 0;
    let syy = 0;
    for (let x = 0; x < period; x++) {
      const dy = src[i - period + 1 + x] - yMean;
      sxy += (x - xMean) * dy;
      syy += dy * dy;
    }
    const m = sxy / sxx;
    const b = yMean - m * xMean;
    value[i] = b + m * (period - 1);
    slope[i] = m;
    r2[i] = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  }
  return { value, slope, r2 };
}

/* ----------------------------------------------------------------------------
 * Eastern-time session helpers (US equities trade on New York time)
 * ------------------------------------------------------------------------- */

const etDayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "YYYY-MM-DD" of the bar in New York time. */
export const etDayKey = (ts: number): string => etDayFmt.format(new Date(ts));

/** Median spacing between bars in ms; used to pick pivot anchoring. */
export function medianBarMs(ts: number[]): number {
  if (ts.length < 3) return 24 * 3600_000;
  const diffs: number[] = [];
  for (let i = 1; i < Math.min(ts.length, 200); i++) diffs.push(ts[i] - ts[i - 1]);
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

/* ----------------------------------------------------------------------------
 * Indicators
 * ------------------------------------------------------------------------- */

export function dema(src: Series, period: number): Series {
  const e1 = ema(src, period);
  const e2 = ema(e1, period);
  return e1.map((v, i) => 2 * v - e2[i]);
}

export function tema(src: Series, period: number): Series {
  const e1 = ema(src, period);
  const e2 = ema(e1, period);
  const e3 = ema(e2, period);
  return e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]);
}

export function vwma(b: Bars, period: number): Series {
  const pv = sma(b.close.map((c, i) => c * b.volume[i]), period);
  const v = sma(b.volume, period);
  return pv.map((x, i) => (v[i] > 0 ? x / v[i] : NaN));
}

/**
 * Session-anchored VWAP with ±stdev bands. Resets at each New York calendar
 * day, so pre-market bars start the day's VWAP (same as TradingView's default
 * "Session" anchor).
 */
export function vwap(b: Bars, bandMult = 1) {
  const n = b.close.length;
  const value = nanArray(n);
  const upper = nanArray(n);
  const lower = nanArray(n);
  const tp = hlc3(b);
  let day = '';
  let cumPV = 0;
  let cumV = 0;
  let cumPV2 = 0;
  for (let i = 0; i < n; i++) {
    const k = etDayKey(b.timestamp[i]);
    if (k !== day) {
      day = k;
      cumPV = 0;
      cumV = 0;
      cumPV2 = 0;
    }
    const v = b.volume[i] || 0;
    cumPV += tp[i] * v;
    cumPV2 += tp[i] * tp[i] * v;
    cumV += v;
    if (cumV > 0) {
      const vw = cumPV / cumV;
      const variance = Math.max(cumPV2 / cumV - vw * vw, 0);
      const sd = Math.sqrt(variance);
      value[i] = vw;
      upper[i] = vw + bandMult * sd;
      lower[i] = vw - bandMult * sd;
    }
  }
  return { value, upper, lower };
}

export function atr(b: Bars, period: number): Series {
  return rma(trueRange(b), period);
}

export function natr(b: Bars, period: number): Series {
  const a = atr(b, period);
  return a.map((v, i) => (b.close[i] ? (v / b.close[i]) * 100 : NaN));
}

/**
 * Supertrend. Returns the band that is currently active, split into an
 * "up" series (trend up, line below price) and "down" series (trend down,
 * line above price) so each can be colored.
 */
export function supertrend(b: Bars, period = 10, mult = 3) {
  const n = b.close.length;
  const a = atr(b, period);
  const up = nanArray(n);
  const down = nanArray(n);
  let finalUpper = NaN;
  let finalLower = NaN;
  let trend = 1;
  for (let i = 0; i < n; i++) {
    if (!isNum(a[i])) continue;
    const mid = (b.high[i] + b.low[i]) / 2;
    const basicUpper = mid + mult * a[i];
    const basicLower = mid - mult * a[i];
    const pc = i > 0 ? b.close[i - 1] : b.close[i];
    const prevUpper = finalUpper;
    const prevLower = finalLower;
    finalUpper = !isNum(prevUpper) || basicUpper < prevUpper || pc > prevUpper ? basicUpper : prevUpper;
    finalLower = !isNum(prevLower) || basicLower > prevLower || pc < prevLower ? basicLower : prevLower;
    if (isNum(prevUpper)) {
      if (trend === -1 && b.close[i] > prevUpper) trend = 1;
      else if (trend === 1 && b.close[i] < prevLower) trend = -1;
    }
    if (trend === 1) up[i] = finalLower;
    else down[i] = finalUpper;
  }
  return { up, down };
}

/**
 * Ichimoku Kinko Hyo. Leading spans are plotted `displacement` bars forward,
 * so the value shown at bar i was computed at bar i - displacement. The
 * lagging span shows the close from `displacement` bars later.
 */
export function ichimoku(b: Bars, conv = 9, base = 26, spanBLen = 52, displacement = 26) {
  const n = b.close.length;
  const mid = (len: number) => {
    const hi = rollingMax(b.high, len);
    const lo = rollingMin(b.low, len);
    return hi.map((h, i) => (h + lo[i]) / 2);
  };
  const tenkan = mid(conv);
  const kijun = mid(base);
  const spanBRaw = mid(spanBLen);
  const spanA = nanArray(n);
  const spanB = nanArray(n);
  const chikou = nanArray(n);
  for (let i = 0; i < n; i++) {
    const j = i - displacement + 1;
    if (j >= 0) {
      spanA[i] = (tenkan[j] + kijun[j]) / 2;
      spanB[i] = spanBRaw[j];
    }
    const k = i + displacement - 1;
    if (k < n) chikou[i] = b.close[k];
  }
  return { tenkan, kijun, spanA, spanB, chikou };
}

/** Slow stochastic: %K smoothed, %D = SMA of %K. */
export function stochastic(b: Bars, kLen = 14, kSmooth = 3, dLen = 3) {
  const hi = rollingMax(b.high, kLen);
  const lo = rollingMin(b.low, kLen);
  const raw = b.close.map((c, i) => (hi[i] - lo[i] === 0 ? 50 : ((c - lo[i]) / (hi[i] - lo[i])) * 100));
  const k = sma(raw.map((v, i) => (isNum(hi[i]) ? v : NaN)), kSmooth);
  const d = sma(k, dLen);
  return { k, d };
}

export function stochRsi(src: Series, rsiLen = 14, stochLen = 14, kSmooth = 3, dLen = 3) {
  const r = rsiSeries(src, rsiLen);
  const hi = rollingMax(r, stochLen);
  const lo = rollingMin(r, stochLen);
  const raw = r.map((v, i) => (!isNum(hi[i]) ? NaN : hi[i] - lo[i] === 0 ? 50 : ((v - lo[i]) / (hi[i] - lo[i])) * 100));
  const k = sma(raw, kSmooth);
  const d = sma(k, dLen);
  return { k, d };
}

export function mfi(b: Bars, period = 14): Series {
  const tp = hlc3(b);
  const out = nanArray(tp.length);
  for (let i = period; i < tp.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const flow = tp[j] * b.volume[j];
      if (tp[j] > tp[j - 1]) pos += flow;
      else if (tp[j] < tp[j - 1]) neg += flow;
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

export function ultimateOscillator(b: Bars, s = 7, m = 14, l = 28): Series {
  const n = b.close.length;
  const bp = nanArray(n);
  const tr = nanArray(n);
  for (let i = 1; i < n; i++) {
    const lo = Math.min(b.low[i], b.close[i - 1]);
    const hi = Math.max(b.high[i], b.close[i - 1]);
    bp[i] = b.close[i] - lo;
    tr[i] = hi - lo;
  }
  const avg = (len: number) => {
    const bs = sma(bp, len).map((v) => v * len);
    const ts = sma(tr, len).map((v) => v * len);
    return bs.map((v, i) => (ts[i] ? v / ts[i] : NaN));
  };
  const a1 = avg(s);
  const a2 = avg(m);
  const a3 = avg(l);
  return a1.map((v, i) => (100 * (4 * v + 2 * a2[i] + a3[i])) / 7);
}

export function tsi(src: Series, long = 25, short = 13, signal = 13) {
  const mom = src.map((v, i) => (i === 0 ? NaN : v - src[i - 1]));
  const num = ema(ema(mom, long), short);
  const den = ema(ema(mom.map(Math.abs), long), short);
  const value = num.map((v, i) => (den[i] ? (100 * v) / den[i] : NaN));
  return { value, signal: ema(value, signal) };
}

export function cmo(src: Series, period = 14): Series {
  const out = nanArray(src.length);
  for (let i = period; i < src.length; i++) {
    let up = 0;
    let dn = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = src[j] - src[j - 1];
      if (d > 0) up += d;
      else dn -= d;
    }
    out[i] = up + dn === 0 ? 0 : (100 * (up - dn)) / (up + dn);
  }
  return out;
}

export function keltner(b: Bars, period = 20, mult = 1.5, atrLen = 10) {
  const mid = ema(b.close, period);
  const a = atr(b, atrLen);
  return {
    mid,
    upper: mid.map((v, i) => v + mult * a[i]),
    lower: mid.map((v, i) => v - mult * a[i]),
  };
}

export function donchian(b: Bars, period = 20) {
  const upper = rollingMax(b.high, period);
  const lower = rollingMin(b.low, period);
  return { upper, lower, mid: upper.map((v, i) => (v + lower[i]) / 2) };
}

export function bollinger(src: Series, period = 20, mult = 2) {
  const mid = sma(src, period);
  const sd = stdev(src, period);
  return { mid, upper: mid.map((v, i) => v + mult * sd[i]), lower: mid.map((v, i) => v - mult * sd[i]) };
}

/** Bollinger Band Width as a percentage of the middle band. */
export function bbWidth(src: Series, period = 20, mult = 2): Series {
  const bb = bollinger(src, period, mult);
  return bb.mid.map((m, i) => (m ? ((bb.upper[i] - bb.lower[i]) / m) * 100 : NaN));
}

export function bbPercentB(src: Series, period = 20, mult = 2): Series {
  const bb = bollinger(src, period, mult);
  return src.map((v, i) => {
    const w = bb.upper[i] - bb.lower[i];
    return w ? (v - bb.lower[i]) / w : NaN;
  });
}

/** Chaikin Volatility: ROC of an EMA of the high-low range. */
export function chaikinVolatility(b: Bars, emaLen = 10, rocLen = 10): Series {
  return roc(ema(b.high.map((h, i) => h - b.low[i]), emaLen), rocLen);
}

const clvVolume = (b: Bars, i: number) => {
  const range = b.high[i] - b.low[i];
  if (range === 0) return 0;
  return ((b.close[i] - b.low[i] - (b.high[i] - b.close[i])) / range) * b.volume[i];
};

/** Accumulation/Distribution line. */
export function accumulationDistribution(b: Bars): Series {
  let acc = 0;
  return b.close.map((_, i) => (acc += clvVolume(b, i)));
}

export function chaikinMoneyFlow(b: Bars, period = 20): Series {
  const mfv = sma(b.close.map((_, i) => clvVolume(b, i)), period);
  const vol = sma(b.volume, period);
  return mfv.map((v, i) => (vol[i] ? v / vol[i] : NaN));
}

export function volumeRoc(b: Bars, period = 14): Series {
  return roc(b.volume, period);
}

/** Volume Price Trend (a.k.a. Price Volume Trend). */
export function volumePriceTrend(b: Bars): Series {
  let acc = 0;
  return b.close.map((c, i) => {
    if (i > 0 && b.close[i - 1]) acc += ((c - b.close[i - 1]) / b.close[i - 1]) * b.volume[i];
    return acc;
  });
}

/** Negative / Positive Volume Index, starting at 1000. */
export function volumeIndex(b: Bars, kind: 'negative' | 'positive'): Series {
  let idx = 1000;
  return b.close.map((c, i) => {
    if (i === 0) return idx;
    const volDown = b.volume[i] < b.volume[i - 1];
    const volUp = b.volume[i] > b.volume[i - 1];
    if ((kind === 'negative' && volDown) || (kind === 'positive' && volUp)) {
      if (b.close[i - 1]) idx += ((c - b.close[i - 1]) / b.close[i - 1]) * idx;
    }
    return idx;
  });
}

export function linearRegression(src: Series, period = 14): Series {
  return linregWindow(src, period).value;
}

export function linearRegressionSlope(src: Series, period = 14): Series {
  return linregWindow(src, period).slope;
}

export function rSquared(src: Series, period = 20): Series {
  return linregWindow(src, period).r2;
}

/** Detrended Price Oscillator (non-centered, usable in real time). */
export function dpo(src: Series, period = 20): Series {
  const avg = sma(src, period);
  const shift = Math.floor(period / 2) + 1;
  return src.map((v, i) => (i >= shift ? v - avg[i - shift] : NaN));
}

/** Pring's Know Sure Thing with the standard 10/15/20/30 settings. */
export function kst(src: Series, signalLen = 9) {
  const r1 = sma(roc(src, 10), 10);
  const r2 = sma(roc(src, 15), 10);
  const r3 = sma(roc(src, 20), 10);
  const r4 = sma(roc(src, 30), 15);
  const value = r1.map((v, i) => v + 2 * r2[i] + 3 * r3[i] + 4 * r4[i]);
  return { value, signal: sma(value, signalLen) };
}

/** Percentage Price Oscillator. */
export function ppo(src: Series, fast = 12, slow = 26, signalLen = 9) {
  const f = ema(src, fast);
  const s = ema(src, slow);
  const value = f.map((v, i) => (s[i] ? ((v - s[i]) / s[i]) * 100 : NaN));
  const signal = ema(value, signalLen);
  return { value, signal, hist: value.map((v, i) => v - signal[i]) };
}

/** Absolute Price Oscillator (fast EMA minus slow EMA, in price units). */
export function apo(src: Series, fast = 10, slow = 21): Series {
  const f = ema(src, fast);
  const s = ema(src, slow);
  return f.map((v, i) => v - s[i]);
}

export function aroon(b: Bars, period = 25) {
  const n = b.close.length;
  const up = nanArray(n);
  const down = nanArray(n);
  for (let i = period; i < n; i++) {
    let hiIdx = i;
    let loIdx = i;
    for (let j = i - period; j <= i; j++) {
      if (b.high[j] >= b.high[hiIdx]) hiIdx = j;
      if (b.low[j] <= b.low[loIdx]) loIdx = j;
    }
    up[i] = (100 * (period - (i - hiIdx))) / period;
    down[i] = (100 * (period - (i - loIdx))) / period;
  }
  return { up, down, osc: up.map((u, i) => u - down[i]) };
}

/** Wilder's ADX with +DI / -DI. */
export function adx(b: Bars, period = 14) {
  const n = b.close.length;
  const plusDM = nanArray(n);
  const minusDM = nanArray(n);
  for (let i = 1; i < n; i++) {
    const upMove = b.high[i] - b.high[i - 1];
    const downMove = b.low[i - 1] - b.low[i];
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }
  const tr = trueRange(b).map((v, i) => (i === 0 ? NaN : v));
  const atrS = rma(tr, period);
  const pdi = rma(plusDM, period).map((v, i) => (atrS[i] ? (100 * v) / atrS[i] : NaN));
  const mdi = rma(minusDM, period).map((v, i) => (atrS[i] ? (100 * v) / atrS[i] : NaN));
  const dx = pdi.map((p, i) => (p + mdi[i] === 0 ? 0 : (100 * Math.abs(p - mdi[i])) / (p + mdi[i])));
  return { adx: rma(dx, period), pdi, mdi };
}

export function momentum(src: Series, period = 10): Series {
  return src.map((v, i) => (i >= period ? v - src[i - period] : NaN));
}

/**
 * Classic floor pivots. Intraday bars use the prior New York day; daily bars
 * use the prior week; weekly-or-longer bars use the prior month.
 */
export function floorPivots(b: Bars) {
  const n = b.close.length;
  const bar = medianBarMs(b.timestamp);
  const periodKey = (ts: number) => {
    const day = etDayKey(ts);
    if (bar < 20 * 3600_000) return day;
    if (bar < 6 * 24 * 3600_000) {
      // ISO-ish week key: the Monday of the week, in ET.
      const d = new Date(`${day}T12:00:00Z`);
      const dow = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - dow);
      return d.toISOString().slice(0, 10);
    }
    return day.slice(0, 7);
  };
  const out = { p: nanArray(n), r1: nanArray(n), s1: nanArray(n), r2: nanArray(n), s2: nanArray(n) };
  let key = '';
  let curH = -Infinity;
  let curL = Infinity;
  let curC = NaN;
  let levels: null | { p: number; r1: number; s1: number; r2: number; s2: number } = null;
  for (let i = 0; i < n; i++) {
    const k = periodKey(b.timestamp[i]);
    if (k !== key) {
      if (key !== '' && isNum(curC)) {
        const p = (curH + curL + curC) / 3;
        levels = { p, r1: 2 * p - curL, s1: 2 * p - curH, r2: p + (curH - curL), s2: p - (curH - curL) };
      }
      key = k;
      curH = -Infinity;
      curL = Infinity;
    }
    curH = Math.max(curH, b.high[i]);
    curL = Math.min(curL, b.low[i]);
    curC = b.close[i];
    if (levels) {
      out.p[i] = levels.p;
      out.r1[i] = levels.r1;
      out.s1[i] = levels.s1;
      out.r2[i] = levels.r2;
      out.s2[i] = levels.s2;
    }
  }
  return out;
}

/**
 * Most recent confirmed swing high and swing low (a bar higher/lower than
 * `strength` bars on each side), carried forward as support/resistance levels.
 * A swing is only known `strength` bars after it happens, so there is no
 * look-ahead.
 */
export function swingLevels(b: Bars, strength = 5) {
  const n = b.close.length;
  const high = nanArray(n);
  const low = nanArray(n);
  let lastHigh = NaN;
  let lastLow = NaN;
  for (let i = 0; i < n; i++) {
    const c = i - strength;
    if (c >= strength) {
      let isHigh = true;
      let isLow = true;
      // Ties: strictly beyond the bars on the left, at least equal to the bars
      // on the right, so a flat top/bottom (equal highs) still counts once.
      for (let j = c - strength; j <= c + strength; j++) {
        if (j === c) continue;
        if (j < c ? b.high[j] >= b.high[c] : b.high[j] > b.high[c]) isHigh = false;
        if (j < c ? b.low[j] <= b.low[c] : b.low[j] < b.low[c]) isLow = false;
      }
      if (isHigh) lastHigh = b.high[c];
      if (isLow) lastLow = b.low[c];
    }
    high[i] = lastHigh;
    low[i] = lastLow;
  }
  return { high, low };
}

/**
 * ZigZag connecting swings that reverse by at least `deviationPct` percent.
 * The final leg is provisional (it can move until the next reversal confirms),
 * the same as on other platforms.
 */
export function zigzag(b: Bars, deviationPct = 5): Series {
  const n = b.close.length;
  const out = nanArray(n);
  if (n === 0) return out;
  const pivots: { i: number; v: number }[] = [];
  let dir = 0; // 1 = looking for higher high, -1 = looking for lower low
  let extIdx = 0;
  let extVal = b.close[0];
  let hiIdx = 0;
  let loIdx = 0;
  for (let i = 1; i < n; i++) {
    if (dir === 0) {
      if (b.high[i] > b.high[hiIdx]) hiIdx = i;
      if (b.low[i] < b.low[loIdx]) loIdx = i;
      if ((b.high[hiIdx] - b.low[loIdx]) / b.low[loIdx] * 100 >= deviationPct) {
        if (hiIdx > loIdx) {
          pivots.push({ i: loIdx, v: b.low[loIdx] });
          dir = 1;
          extIdx = hiIdx;
          extVal = b.high[hiIdx];
        } else {
          pivots.push({ i: hiIdx, v: b.high[hiIdx] });
          dir = -1;
          extIdx = loIdx;
          extVal = b.low[loIdx];
        }
      }
      continue;
    }
    if (dir === 1) {
      if (b.high[i] >= extVal) {
        extIdx = i;
        extVal = b.high[i];
      } else if ((extVal - b.low[i]) / extVal * 100 >= deviationPct) {
        pivots.push({ i: extIdx, v: extVal });
        dir = -1;
        extIdx = i;
        extVal = b.low[i];
      }
    } else {
      if (b.low[i] <= extVal) {
        extIdx = i;
        extVal = b.low[i];
      } else if ((b.high[i] - extVal) / extVal * 100 >= deviationPct) {
        pivots.push({ i: extIdx, v: extVal });
        dir = 1;
        extIdx = i;
        extVal = b.high[i];
      }
    }
  }
  if (dir !== 0) pivots.push({ i: extIdx, v: extVal });
  for (let p = 1; p < pivots.length; p++) {
    const a = pivots[p - 1];
    const c = pivots[p];
    for (let i = a.i; i <= c.i; i++) {
      out[i] = a.v + ((c.v - a.v) * (i - a.i)) / Math.max(c.i - a.i, 1);
    }
  }
  return out;
}

/** Split a KLineChart data list into column arrays. */
export function toBars(list: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume?: number }>): Bars {
  const n = list.length;
  const b: Bars = {
    timestamp: new Array(n),
    open: new Array(n),
    high: new Array(n),
    low: new Array(n),
    close: new Array(n),
    volume: new Array(n),
  };
  for (let i = 0; i < n; i++) {
    const d = list[i];
    b.timestamp[i] = d.timestamp;
    b.open[i] = d.open;
    b.high[i] = d.high;
    b.low[i] = d.low;
    b.close[i] = d.close;
    b.volume[i] = d.volume ?? 0;
  }
  return b;
}

/* ----------------------------------------------------------------------------
 * Classic indicators (re-implemented because the library's built-ins use
 * different formulas: e.g. its "SMA" is a weighted smoothing average, its RSI
 * uses simple sums instead of Wilder smoothing, and its SAR expects percent
 * inputs).
 * ------------------------------------------------------------------------- */

export function macd(src: Series, fast = 12, slow = 26, signalLen = 9) {
  const f = ema(src, fast);
  const s = ema(src, slow);
  const line = f.map((v, i) => v - s[i]);
  const signal = ema(line, signalLen);
  return { line, signal, hist: line.map((v, i) => v - signal[i]) };
}

/** Wilder's Parabolic SAR. */
export function parabolicSar(b: Bars, start = 0.02, increment = 0.02, max = 0.2): Series {
  const n = b.close.length;
  const out = nanArray(n);
  if (n < 2) return out;
  let up = b.close[1] >= b.close[0];
  let af = start;
  let ep = up ? Math.max(b.high[0], b.high[1]) : Math.min(b.low[0], b.low[1]);
  let sar = up ? Math.min(b.low[0], b.low[1]) : Math.max(b.high[0], b.high[1]);
  out[1] = sar;
  for (let i = 2; i < n; i++) {
    sar = sar + af * (ep - sar);
    if (up) {
      sar = Math.min(sar, b.low[i - 1], b.low[i - 2]);
      if (b.low[i] < sar) {
        up = false;
        sar = ep;
        ep = b.low[i];
        af = start;
      } else if (b.high[i] > ep) {
        ep = b.high[i];
        af = Math.min(af + increment, max);
      }
    } else {
      sar = Math.max(sar, b.high[i - 1], b.high[i - 2]);
      if (b.high[i] > sar) {
        up = true;
        sar = ep;
        ep = b.high[i];
        af = start;
      } else if (b.low[i] < ep) {
        ep = b.low[i];
        af = Math.min(af + increment, max);
      }
    }
    out[i] = sar;
  }
  return out;
}

export function cci(b: Bars, period = 20): Series {
  const tp = hlc3(b);
  const mean = sma(tp, period);
  return tp.map((v, i) => {
    if (!isNum(mean[i])) return NaN;
    let md = 0;
    for (let j = i - period + 1; j <= i; j++) md += Math.abs(tp[j] - mean[i]);
    md /= period;
    return md === 0 ? 0 : (v - mean[i]) / (0.015 * md);
  });
}

/** Williams %R, scaled -100..0. */
export function williamsR(b: Bars, period = 14): Series {
  const hi = rollingMax(b.high, period);
  const lo = rollingMin(b.low, period);
  return b.close.map((c, i) => (hi[i] - lo[i] === 0 ? -50 : ((hi[i] - c) / (hi[i] - lo[i])) * -100));
}

export function obv(b: Bars): Series {
  let acc = 0;
  return b.close.map((c, i) => {
    if (i > 0) {
      if (c > b.close[i - 1]) acc += b.volume[i];
      else if (c < b.close[i - 1]) acc -= b.volume[i];
    }
    return acc;
  });
}

/** Ease of Movement, smoothed, scaled per 10,000 shares. */
export function easeOfMovement(b: Bars, period = 14, divisor = 10000): Series {
  const raw = b.close.map((_, i) => {
    if (i === 0 || b.volume[i] === 0) return NaN;
    const midMove = (b.high[i] + b.low[i]) / 2 - (b.high[i - 1] + b.low[i - 1]) / 2;
    return (divisor * midMove * (b.high[i] - b.low[i])) / b.volume[i];
  });
  return sma(raw.map((v) => (isNum(v) ? v : 0)), period).map((v, i) => (i === 0 ? NaN : v));
}

/** TRIX: 1-bar percent change of a triple-smoothed EMA. */
export function trix(src: Series, period = 18): Series {
  const t = ema(ema(ema(src.map(Math.log), period), period), period);
  return t.map((v, i) => (i > 0 && isNum(t[i - 1]) ? (v - t[i - 1]) * 10000 : NaN));
}

/** Bill Williams' Awesome Oscillator. */
export function awesomeOscillator(b: Bars): Series {
  const mid = b.high.map((h, i) => (h + b.low[i]) / 2);
  const f = sma(mid, 5);
  const s = sma(mid, 34);
  return f.map((v, i) => v - s[i]);
}
