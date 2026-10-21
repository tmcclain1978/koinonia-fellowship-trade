/**
 * Order flow chart layers, drawn straight onto the chart canvas:
 *
 *  - KF_OF_HEAT   liquidity heatmap: resting Level 2 orders over time, drawn
 *                 behind the candles (zLevel < 0 = "destination-over").
 *  - KF_OF_PRINTS big-trade bubbles and the footprint (bought x sold at each
 *                 price inside a bar, when bars are wide enough).
 *  - KF_OF_DELTA  bought minus sold volume per bar (own pane).
 *  - KF_OF_CVD    running total of that delta (own pane).
 *
 * Each layer finds its data by symbol (indicator extendData) in the shared
 * recorder, so several charts can show different symbols.
 */
import { registerIndicator, type Chart, type KLineData, type XAxis, type YAxis } from "klinecharts";
import { cumulativeDelta, footprintRowSize, percentile, priceStep, type BookFrame } from "./flow";
import { peekOrderFlow, type OrderFlowRecorder } from "./recorder";

export interface OrderFlowLayerState {
  symbol: string;
  heatmap: boolean;
  bubbles: boolean;
  footprint: boolean;
  delta: boolean;
  cvd: boolean;
  /** Shares; 0 = automatic (largest ~2% of trades on screen). */
  bigPrint: number;
  dark: boolean;
}

interface Ext extends OrderFlowLayerState {
  /** Bumped to force a redraw when new data arrives. */
  v: number;
}

export const OF_HEAT = "KF_OF_HEAT";
export const OF_PRINTS = "KF_OF_PRINTS";
export const OF_DELTA = "KF_OF_DELTA";
export const OF_CVD = "KF_OF_CVD";

const UP = "#26a69a";
const DOWN = "#ef5350";

/* ---- time and price -> pixels -------------------------------------------- */

function medianBarMs(data: KLineData[]): number {
  const d: number[] = [];
  for (let i = Math.max(1, data.length - 40); i < data.length; i++) {
    const g = data[i].timestamp - data[i - 1].timestamp;
    if (g > 0) d.push(g);
  }
  return d.length ? percentile(d, 0.5) : 60_000;
}

/** Index of the last bar starting at or before ts (-1 if none). */
function barIndexAt(data: KLineData[], ts: number): number {
  let lo = 0, hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (data[mid].timestamp <= ts) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

export interface Mapper {
  data: KLineData[];
  barMs: number;
  bar: number;
  /** Pixel x for a moment in time, placed inside its bar. */
  x: (ts: number) => number | null;
  y: (price: number) => number;
  from: number;
  to: number;
}

export function makeMapper(chart: Chart, xAxis: XAxis, yAxis: YAxis, now: number): Mapper | null {
  const data = chart.getDataList();
  if (!data.length) return null;
  const barMs = medianBarMs(data);
  const bar = chart.getBarSpace().bar;
  const x = (ts: number) => {
    const i = barIndexAt(data, ts);
    if (i < 0) return null;
    const start = data[i].timestamp;
    const next = data[i + 1]?.timestamp ?? Infinity;
    const span = Math.max(1, Math.min(next, start + barMs) - start);
    const frac = Math.min(1, Math.max(0, (ts - start) / span));
    return xAxis.convertTimestampToPixel(start) - bar / 2 + frac * bar;
  };
  // Linear price axis: map with one multiply instead of thousands of axis calls.
  const p0 = data[data.length - 1].close || 1;
  const a0 = yAxis.convertToPixel(p0);
  const a1 = yAxis.convertToPixel(p0 * 1.01);
  const a2 = yAxis.convertToPixel(p0 * 0.99);
  const slope = (a1 - a0) / (p0 * 0.01);
  const linear = Math.abs(a0 - slope * p0 * 0.01 - a2) < 0.5;
  const y = linear ? (p: number) => a0 + (p - p0) * slope : (p: number) => yAxis.convertToPixel(p);
  const range = chart.getVisibleRange();
  const fromIdx = Math.max(0, Math.min(data.length - 1, Math.floor(range.from)));
  const toIdx = Math.ceil(range.to);
  return {
    data,
    barMs,
    bar,
    x,
    y,
    from: data[fromIdx].timestamp,
    to: toIdx + 1 < data.length ? data[toIdx + 1].timestamp : Math.max(now, data[data.length - 1].timestamp + barMs),
  };
}

/* ---- heatmap ------------------------------------------------------------- */

const BUCKETS = 14;
/** Blue (thin) -> cyan -> yellow -> orange-red (heavy). Readable on dark and light charts. */
const STOPS: Array<[number, [number, number, number]]> = [
  [0, [37, 99, 235]],
  [0.45, [6, 182, 212]],
  [0.75, [250, 204, 21]],
  [1, [239, 68, 68]],
];
export const HEAT_COLORS = Array.from({ length: BUCKETS }, (_, b) => {
  const t = (b + 1) / BUCKETS;
  let k = 0;
  while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++;
  const [t0, c0] = STOPS[k];
  const [t1, c1] = STOPS[k + 1];
  const f = (t - t0) / (t1 - t0);
  const c = c0.map((v, i) => Math.round(v + (c1[i] - v) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${(0.22 + 0.6 * t).toFixed(2)})`;
});

/** Scale: the size that gets the hottest color (95th percentile on screen). */
function heatScale(frames: BookFrame[]): number {
  const sizes: number[] = [];
  const stride = Math.max(1, Math.floor(frames.length / 300));
  for (let i = 0; i < frames.length; i += stride) {
    for (const side of [frames[i].bids, frames[i].asks]) for (let j = 1; j < side.length; j += 2) sizes.push(side[j]);
  }
  return Math.max(1, percentile(sizes, 0.95));
}

export function drawHeatmap(ctx: CanvasRenderingContext2D, m: Mapper, rec: OrderFlowRecorder, width: number, height: number, now: number) {
  const frames = rec.book.range(m.from, m.to);
  if (!frames.length) return;
  const scale = heatScale(frames);
  const step = priceStep(frames[frames.length - 1]);
  const ref = m.data[m.data.length - 1].close || 1;
  const ph = Math.min(14, Math.max(1, Math.abs(m.y(ref) - m.y(ref + step))));
  const rects: number[][] = Array.from({ length: BUCKETS }, () => []);
  for (let k = 0; k < frames.length; k++) {
    const f = frames[k];
    const xa = m.x(f.time);
    const xb = k + 1 < frames.length ? m.x(frames[k + 1].time) : m.x(now);
    if (xa === null || xb === null) continue;
    const left = Math.floor(Math.max(0, xa));
    const right = Math.ceil(Math.min(width, xb));
    // Several frames in one pixel column: only the one that crosses into the next column draws.
    if (right <= left || (Math.floor(xa) === Math.floor(xb) && k + 1 < frames.length)) continue;
    for (const side of [f.bids, f.asks]) {
      for (let j = 0; j < side.length; j += 2) {
        const t = side[j + 1] / scale;
        if (t < 0.04) continue;
        const yc = m.y(side[j]);
        if (yc < -ph || yc > height + ph) continue;
        const b = Math.min(BUCKETS - 1, Math.floor(Math.min(1, t) * BUCKETS));
        rects[b].push(left, yc - ph / 2, right - left, ph);
      }
    }
  }
  for (let b = 0; b < BUCKETS; b++) {
    const r = rects[b];
    if (!r.length) continue;
    ctx.fillStyle = HEAT_COLORS[b];
    for (let i = 0; i < r.length; i += 4) ctx.fillRect(r[i], r[i + 1], r[i + 2], r[i + 3]);
  }
}

/* ---- bubbles, footprint, recording marker -------------------------------- */

export const fmtVol = (v: number): string =>
  v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}K` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(Math.round(v));

/**
 * Bars must be at least this wide (px) to fit footprint numbers. The chart
 * allows at most 50 px per bar, so this is "zoomed in most of the way".
 */
export const FOOTPRINT_MIN_BAR_PX = 44;

export function drawPrints(ctx: CanvasRenderingContext2D, m: Mapper, rec: OrderFlowRecorder, ext: OrderFlowLayerState, width: number, height: number) {
  const text = ext.dark ? "#e5e7eb" : "#111827";
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "middle";

  // Where recording began: bars to the left have no order flow.
  const xs = m.x(rec.startedAt);
  if (xs !== null && xs > 0 && xs < width) {
    ctx.save();
    ctx.strokeStyle = ext.dark ? "rgba(148,163,184,0.6)" : "rgba(71,85,105,0.6)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(xs) + 0.5, 0);
    ctx.lineTo(Math.round(xs) + 0.5, height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ext.dark ? "rgba(148,163,184,0.9)" : "rgba(71,85,105,0.9)";
    // Near the right edge, put the label on the left of the line so it isn't cut off.
    const roomRight = width - xs > 130;
    ctx.textAlign = roomRight ? "left" : "right";
    ctx.fillText(roomRight ? "Order flow from here →" : "Order flow starts here →", Math.round(xs) + (roomRight ? 4 : -4), height - 10);
    ctx.restore();
  }


  if (ext.bubbles) {
    const prints = rec.prints.range(m.from, m.to).filter((p) => p.side !== "unknown");
    if (prints.length) {
      const threshold = ext.bigPrint > 0 ? ext.bigPrint : Math.max(100, percentile(prints.map((p) => p.size), 0.98));
      const big = prints.filter((p) => p.size >= threshold);
      const max = Math.max(...big.map((p) => p.size), 1);
      for (const p of big) {
        const x = m.x(p.time);
        const y = m.y(p.price);
        if (x === null || x < -20 || x > width + 20 || y < -20 || y > height + 20) continue;
        const r = 3 + 11 * Math.sqrt(p.size / max);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = p.side === "buy" ? "rgba(38,166,154,0.35)" : "rgba(239,83,80,0.35)";
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = p.side === "buy" ? UP : DOWN;
        ctx.stroke();
        if (r >= 9) {
          ctx.fillStyle = text;
          ctx.textAlign = "center";
          ctx.fillText(fmtVol(p.size), x, y);
        }
      }
    }
  }

  // Footprint last so its numbers stay readable over bubbles.
  if (ext.footprint && m.bar >= FOOTPRINT_MIN_BAR_PX) drawFootprint(ctx, m, rec, ext, width, height);
}

function drawFootprint(ctx: CanvasRenderingContext2D, m: Mapper, rec: OrderFlowRecorder, ext: OrderFlowLayerState, width: number, height: number) {
  const ref = m.data[m.data.length - 1].close || 1;
  const pxPerDollar = Math.abs(m.y(ref) - m.y(ref + 1));
  const rowSize = footprintRowSize(pxPerDollar, 11, priceStep(rec.book.frames[rec.book.frames.length - 1]));
  const rowPx = rowSize * pxPerDollar;
  const first = barIndexAt(m.data, m.from);
  const bg = ext.dark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.8)";
  ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
  for (let i = Math.max(0, first); i < m.data.length; i++) {
    const start = m.data[i].timestamp;
    if (start >= m.to) break;
    const end = m.data[i + 1]?.timestamp ?? Infinity;
    const rows = rec.prints.footprint(start, end, rowSize);
    if (!rows.length) continue;
    const xc = m.x(start + 0.5 * Math.min(m.barMs, (end === Infinity ? m.barMs : end - start)))!;
    if (xc < -m.bar || xc > width + m.bar) continue;
    const half = m.bar / 2 - 1;
    let poc = rows[0];
    for (const r of rows) if (r.buy + r.sell > poc.buy + poc.sell) poc = r;
    let delta = 0;
    let lowY = -Infinity;
    for (const r of rows) {
      delta += r.buy - r.sell;
      const top = m.y(r.price + rowSize);
      const yMid = top + rowPx / 2;
      lowY = Math.max(lowY, top + rowPx);
      if (yMid < -rowPx || yMid > height + rowPx) continue;
      ctx.fillStyle = bg;
      ctx.fillRect(xc - half, top + 0.5, half * 2, Math.max(1, rowPx - 1));
      // Shade the side that traded more at this price.
      const tot = r.buy + r.sell;
      if (tot > 0) {
        const lean = (r.buy - r.sell) / tot;
        ctx.fillStyle = lean >= 0 ? `rgba(38,166,154,${(0.15 + 0.45 * lean).toFixed(2)})` : `rgba(239,83,80,${(0.15 - 0.45 * lean).toFixed(2)})`;
        ctx.fillRect(xc - half, top + 0.5, half * 2, Math.max(1, rowPx - 1));
      }
      if (r === poc) {
        ctx.strokeStyle = ext.dark ? "#facc15" : "#ca8a04";
        ctx.lineWidth = 1;
        ctx.strokeRect(xc - half + 0.5, top + 1, half * 2 - 1, Math.max(1, rowPx - 2));
      }
      if (rowPx >= 9) {
        ctx.fillStyle = ext.dark ? "#f1f5f9" : "#0f172a";
        ctx.textAlign = "right";
        ctx.fillText(fmtVol(r.sell), xc - 1, yMid);
        ctx.textAlign = "left";
        ctx.fillText(fmtVol(r.buy), xc + 1, yMid);
      }
    }
    if (lowY > -Infinity && lowY + 12 < height) {
      const label = `Δ ${delta >= 0 ? "+" : "−"}${fmtVol(Math.abs(delta))}`;
      const tw = ctx.measureText(label).width + 6;
      ctx.fillStyle = bg;
      ctx.fillRect(xc - tw / 2, lowY + 2, tw, 13);
      ctx.textAlign = "center";
      ctx.fillStyle = delta >= 0 ? UP : DOWN;
      ctx.fillText(label, xc, lowY + 9);
    }
  }
}

/* ---- registration -------------------------------------------------------- */

let registered = false;

export function registerOrderFlowIndicators() {
  if (registered) return;
  registered = true;
  const always = () => ({ calc: true, draw: true });

  registerIndicator<Record<string, number>, number, Ext>({
    name: OF_HEAT,
    shortName: "Liquidity heatmap",
    series: "price" as never,
    figures: [],
    calc: (list) => list.map(() => ({})),
    draw: ({ ctx, chart, indicator, bounding, xAxis, yAxis }) => {
      const ext = indicator.extendData;
      const rec = peekOrderFlow(ext?.symbol);
      if (!rec || !xAxis || !yAxis) return true;
      const now = Date.now();
      const m = makeMapper(chart, xAxis, yAxis, now);
      if (m) drawHeatmap(ctx, m, rec, bounding.width, bounding.height, now);
      return true;
    },
  } as never);

  registerIndicator<Record<string, number>, number, Ext>({
    name: OF_PRINTS,
    shortName: "Order flow",
    series: "price" as never,
    figures: [],
    calc: (list) => list.map(() => ({})),
    draw: ({ ctx, chart, indicator, bounding, xAxis, yAxis }) => {
      const ext = indicator.extendData;
      const rec = peekOrderFlow(ext?.symbol);
      if (!rec || !xAxis || !yAxis) return true;
      const m = makeMapper(chart, xAxis, yAxis, Date.now());
      if (m) drawPrints(ctx, m, rec, ext, bounding.width, bounding.height);
      return true;
    },
  } as never);

  const flows = (list: KLineData[], ext: Ext | undefined) => {
    const rec = peekOrderFlow(ext?.symbol);
    return rec ? rec.prints.barFlows(list.map((d) => d.timestamp)) : list.map(() => null);
  };

  registerIndicator<{ d?: number }, number, Ext>({
    name: OF_DELTA,
    shortName: "Delta (bought − sold)",
    precision: 0,
    shouldFormatBigNumber: true,
    shouldUpdate: always,
    figures: [
      {
        key: "d",
        title: "Delta: ",
        type: "bar",
        baseValue: 0,
        styles: ({ data }: { data: { current?: { d?: number } | null } }) => {
          const color = (data.current?.d ?? 0) >= 0 ? UP : DOWN;
          return { style: "fill", color, borderColor: color };
        },
      },
    ],
    calc: (list, indicator) => flows(list, indicator.extendData).map((f) => (f ? { d: f.delta } : {})),
  } as never);

  registerIndicator<{ c?: number }, number, Ext>({
    name: OF_CVD,
    shortName: "Cumulative delta",
    precision: 0,
    shouldFormatBigNumber: true,
    shouldUpdate: always,
    figures: [{ key: "c", title: "CVD: ", type: "line" }],
    calc: (list, indicator) => cumulativeDelta(flows(list, indicator.extendData)).map((c) => (c === null ? {} : { c })),
  } as never);
}

/* ---- keep layers in step with settings ----------------------------------- */

const LAYERS: Array<{ name: string; id: string; pane: string; key: keyof OrderFlowLayerState; zLevel: number }> = [
  { name: OF_HEAT, id: "of_heat", pane: "candle_pane", key: "heatmap", zLevel: -10 },
  { name: OF_PRINTS, id: "of_prints", pane: "candle_pane", key: "bubbles", zLevel: 50 },
  { name: OF_DELTA, id: "of_delta", pane: "of_delta_pane", key: "delta", zLevel: 0 },
  { name: OF_CVD, id: "of_cvd", pane: "of_cvd_pane", key: "cvd", zLevel: 0 },
];

const lastState = new WeakMap<Chart, OrderFlowLayerState | null>();
let version = 0;

/** Add, update or remove the order flow layers on a chart. Pass null to remove all. */
export function syncOrderFlowLayers(chart: Chart, state: OrderFlowLayerState | null) {
  registerOrderFlowIndicators();
  lastState.set(chart, state);
  const ext: Ext | null = state ? { ...state, v: ++version } : null;
  for (const l of LAYERS) {
    const on = !!state && (l.key === "bubbles" ? state.bubbles || state.footprint : !!state[l.key]);
    const exists = chart.getIndicators({ id: l.id }).length > 0;
    if (!on) {
      if (exists) chart.removeIndicator({ id: l.id });
      continue;
    }
    if (exists) chart.overrideIndicator({ name: l.name, id: l.id, extendData: ext } as never);
    else {
      try {
        chart.createIndicator({ name: l.name, id: l.id, extendData: ext, zLevel: l.zLevel } as never, true, { id: l.pane, ...(l.pane === "candle_pane" ? {} : { height: 90 }) } as never);
      } catch (err) {
        console.warn("[orderflow] could not add layer", l.name, err);
      }
    }
  }
}

/** New data arrived: redraw (and recalculate delta) without changing settings. */
export function refreshOrderFlowLayers(chart: Chart) {
  const s = lastState.get(chart);
  if (s) syncOrderFlowLayers(chart, s);
}

/** Put the layers back after something removed every indicator on the chart. */
export function restoreOrderFlowLayers(chart: Chart) {
  const s = lastState.get(chart);
  if (s) syncOrderFlowLayers(chart, s);
}
