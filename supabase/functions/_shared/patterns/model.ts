/**
 * Confidence score: one number that weighs everything known about a setup
 * (the pattern's own record, the trend, the market, time of day, room to
 * the target, volume, VWAP side) into a chance of reaching the target first.
 *
 * It's a small logistic model, trained the honest way ("walk-forward"):
 *   - learn from the OLDER 70% of past signals (by date)
 *   - then check it on the NEWER 30% it never saw
 * The pattern's record used as an input is also computed from the older
 * part only, so nothing from the test period leaks in.
 *
 * The score is only used if, on the unseen newer data, its top-rated
 * signals beat the average signal by a clear margin. Otherwise the page
 * says so and predictions use the simple rules alone.
 */
import type { Dir } from "./detect.ts";
import type { MoveRecord, MoveRecords } from "./moves.ts";
import type { BarContext, Trend } from "./context.ts";

export const FEATURES = [
  "Pattern's own record",
  "Trend agrees",
  "Trend against",
  "Market agrees",
  "Market against",
  "Room to target",
  "Volume vs normal",
  "On the right side of VWAP",
  "Morning (9:45-11:30)",
  "Lunch (11:30-1:30)",
  "Afternoon (1:30-3:30)",
  "Last 30 minutes",
] as const;

export interface ConfidenceModel {
  weights: number[];
  bias: number;
  /** Shrunk hit rate per pattern|dir from the training part (the first input). */
  priors: Record<string, number>;
  /** Hit rate of all training signals (the prior's anchor). */
  baseRate: number;
  /** Feature means/spreads used to scale inputs. */
  mean: number[];
  scale: number[];
}

export interface ModelCheck {
  trainN: number;
  testN: number;
  /** Hit rate of all signals in the unseen (test) part. */
  testRate: number;
  /** Signals in the test part grouped by score: what actually happened. */
  buckets: Array<{ label: string; from: number; to: number; n: number; predicted: number; actual: number }>;
  /** Hit rate of the top 30% scores on unseen data. */
  topRate: number;
  topN: number;
  /** Chance a random winner scores above a random loser (0.5 = no skill). */
  auc: number;
  /** Used only if the top 30% beat the average by at least this much on unseen data. */
  useful: boolean;
  /** Inputs that mattered most, in plain words. */
  drivers: Array<{ name: string; effect: "helps" | "hurts"; weight: number }>;
  /** Date the test part starts. */
  splitAt: number;
}

const LIFT_NEEDED = 0.03;
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const logit = (p: number) => Math.log(Math.max(1e-4, Math.min(1 - 1e-4, p)) / (1 - Math.max(1e-4, Math.min(1 - 1e-4, p))));

export interface LiveInput {
  pattern: string;
  dir: Dir;
  ctx: BarContext | undefined;
  market: Trend | null;
  px: number;
}

/** Raw input numbers for one signal. */
export function features(r: LiveInput, priors: Record<string, number>, baseRate: number): number[] {
  const c = r.ctx;
  const p = priors[`${r.pattern}|${r.dir}`] ?? baseRate;
  const agree = (t: Trend | null | undefined) => (t && t !== "flat" ? (t === r.dir ? 1 : 0) : 0);
  const against = (t: Trend | null | undefined) => (t && t !== "flat" ? (t !== r.dir ? 1 : 0) : 0);
  const room = c ? (r.dir === "up" ? c.roomUp : c.roomDown) : undefined;
  const rvol = c?.rvol ?? null;
  const vwapSide = c?.vwap ? ((r.px > c.vwap) === (r.dir === "up") ? 1 : 0) : 0.5;
  const w = c?.window ?? null;
  return [
    logit(p),
    agree(c?.trend),
    against(c?.trend),
    agree(r.market),
    against(r.market),
    room === false ? 0 : 1,
    rvol === null ? 0 : Math.log(Math.max(0.2, Math.min(5, rvol))),
    vwapSide,
    w === "morning" ? 1 : 0,
    w === "lunch" ? 1 : 0,
    w === "afternoon" ? 1 : 0,
    w === "close" ? 1 : 0,
  ];
}

/** Chance of reaching the target first, from the model. */
export function score(m: ConfidenceModel, r: LiveInput): number {
  const x = features(r, m.priors, m.baseRate);
  let z = m.bias;
  for (let k = 0; k < x.length; k++) z += m.weights[k] * ((x[k] - m.mean[k]) / m.scale[k]);
  return sigmoid(z);
}

const isWin = (r: MoveRecord) => (r.o === "win" ? 1 : 0);

/** Pattern records from `list`, pulled toward the overall rate (fewer examples -> pulled more). */
function priorsFrom(list: MoveRecord[], base: number, k = 30): Record<string, number> {
  const g = new Map<string, { w: number; n: number }>();
  for (const r of list) {
    const key = `${r.pattern}|${r.dir}`;
    const v = g.get(key) ?? { w: 0, n: 0 };
    v.w += isWin(r);
    v.n++;
    g.set(key, v);
  }
  const out: Record<string, number> = {};
  for (const [key, v] of g) out[key] = (v.w + k * base) / (v.n + k);
  return out;
}

/** Fit logistic weights with plain gradient descent (L2-regularized). */
function fit(X: number[][], y: number[], l2 = 0.02, steps = 400, lr = 0.3) {
  const d = X[0].length;
  const w = new Array(d).fill(0);
  let b = logit(y.reduce((a, v) => a + v, 0) / y.length);
  const n = X.length;
  for (let s = 0; s < steps; s++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b;
      for (let k = 0; k < d; k++) z += w[k] * X[i][k];
      const e = sigmoid(z) - y[i];
      gb += e;
      for (let k = 0; k < d; k++) gw[k] += e * X[i][k];
    }
    b -= (lr * gb) / n;
    for (let k = 0; k < d; k++) w[k] -= lr * (gw[k] / n + l2 * w[k]);
  }
  return { w, b };
}

function auc(scores: number[], y: number[]): number {
  const idx = scores.map((s, i) => [s, y[i]] as const).sort((a, b) => a[0] - b[0]);
  let rankSum = 0;
  let pos = 0;
  for (let i = 0; i < idx.length; i++) {
    if (idx[i][1] === 1) {
      rankSum += i + 1;
      pos++;
    }
  }
  const neg = idx.length - pos;
  return pos && neg ? (rankSum - (pos * (pos + 1)) / 2) / (pos * neg) : 0.5;
}

/**
 * Train on the older 70% of pattern signals, check on the newer 30%.
 * Returns null when there are too few signals to say anything.
 */
export function trainModel(rec: MoveRecords, opts: { trainShare?: number; minSignals?: number } = {}): { model: ConfidenceModel; check: ModelCheck } | null {
  const sigs = rec.records.filter((r) => r.pattern !== null).sort((a, b) => a.t - b.t);
  if (sigs.length < (opts.minSignals ?? 300)) return null;
  const cut = Math.floor(sigs.length * (opts.trainShare ?? 0.7));
  const train = sigs.slice(0, cut);
  const test = sigs.slice(cut);
  const baseRate = train.reduce((a, r) => a + isWin(r), 0) / train.length;
  const priors = priorsFrom(train, baseRate);
  const raw = train.map((r) => features({ pattern: r.pattern!, dir: r.dir, ctx: r.ctx, market: r.market, px: r.px }, priors, baseRate));
  const d = raw[0].length;
  const mean = Array.from({ length: d }, (_, k) => raw.reduce((a, x) => a + x[k], 0) / raw.length);
  const scale = Array.from({ length: d }, (_, k) => Math.sqrt(raw.reduce((a, x) => a + (x[k] - mean[k]) ** 2, 0) / raw.length) || 1);
  const X = raw.map((x) => x.map((v, k) => (v - mean[k]) / scale[k]));
  const { w, b } = fit(X, train.map(isWin));
  const model: ConfidenceModel = { weights: w, bias: b, priors, baseRate, mean, scale };

  const ts = test.map((r) => score(model, { pattern: r.pattern!, dir: r.dir, ctx: r.ctx, market: r.market, px: r.px }));
  const ty = test.map(isWin);
  const testRate = ty.reduce((a, v) => a + v, 0) / Math.max(1, ty.length);
  const order = ts.map((s, i) => i).sort((a, c) => ts[c] - ts[a]);
  const topN = Math.max(1, Math.floor(order.length * 0.3));
  const topRate = order.slice(0, topN).reduce((a, i) => a + ty[i], 0) / topN;
  // Buckets by score, on the unseen part.
  const bounds = [0, 0.35, 0.45, 0.55, 0.65, 1.01];
  const labels = ["under 35%", "35-45%", "45-55%", "55-65%", "65% and up"];
  const buckets = labels.map((label, k) => {
    const ids = ts.map((s, i) => i).filter((i) => ts[i] >= bounds[k] && ts[i] < bounds[k + 1]);
    return {
      label,
      from: bounds[k],
      to: Math.min(1, bounds[k + 1]),
      n: ids.length,
      predicted: ids.length ? ids.reduce((a, i) => a + ts[i], 0) / ids.length : 0,
      actual: ids.length ? ids.reduce((a, i) => a + ty[i], 0) / ids.length : 0,
    };
  });
  const drivers = FEATURES.map((name, k) => ({ name, effect: (w[k] >= 0 ? "helps" : "hurts") as "helps" | "hurts", weight: w[k] }))
    .filter((x) => Math.abs(x.weight) >= 0.03)
    .sort((a, c) => Math.abs(c.weight) - Math.abs(a.weight))
    .slice(0, 6);
  return {
    model,
    check: {
      trainN: train.length,
      testN: test.length,
      testRate,
      buckets,
      topRate,
      topN,
      auc: auc(ts, ty),
      useful: test.length >= 100 && topRate >= testRate + LIFT_NEEDED,
      drivers,
      splitAt: test[0]?.t ?? 0,
    },
  };
}
