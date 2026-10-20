/**
 * Alert evaluation, shared by the evaluate-alerts edge function and the
 * browser (for previews and tests). Pure: no network, no clock reads.
 *
 * Price checks use 1-minute bars since the last check, so a price that
 * touches a level and comes back between two checks still counts.
 * Indicator checks use completed bars of the alert's timeframe only, so an
 * alert never fires on a bar that could still change.
 */
import { sma, rsiSeries, macd } from "./indicator-calc.ts";
import { etWallTimeToEpoch } from "./candle-buckets.ts";

export type AlertType =
  | "price_above" | "price_below" | "percent_change" | "volume_spike"
  | "rsi_overbought" | "rsi_oversold" | "macd_cross" | "sma_cross" | "line_cross";

export type AlertTimeframe = "5" | "15" | "60" | "D";

export interface AlertLine {
  points: [{ t: number; v: number }, { t: number; v: number }];
  /** segment = between the points; ray = from the first point onward; extended = both ways; horizontal = flat at the first value. */
  kind: "segment" | "ray" | "extended" | "horizontal";
  /** Trading hours the line was drawn on (its slope is measured in trading time). */
  session: "regular" | "extended";
}

export interface AlertCondition {
  timeframe?: AlertTimeframe;
  line?: AlertLine;
  direction?: "any" | "up" | "down";
}

export interface AlertRow {
  id: string;
  symbol: string;
  alert_type: string;
  target_value: number;
  condition?: AlertCondition | null;
  /** Close at the previous check (for crossing detection). */
  last_price?: number | null;
}

export interface Bar {
  t: number; // bar start, epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface EvalContext {
  /** 1-minute bars since the last check, oldest first. */
  minuteBars: Bar[];
  /** Previous regular-session close (for % change). */
  prevClose?: number | null;
  /** Bars of the alert's timeframe, oldest first (the last one may still be forming). */
  tfBars?: Bar[];
  /** Length of one timeframe bar in ms (to tell completed bars from the forming one). */
  tfMs?: number;
  /** Average 1-minute volume over recent sessions (for volume spikes). */
  avgMinuteVolume?: number | null;
  /** Last 15 minutes of 1-minute bars (for volume spikes). */
  recentMinuteBars?: Bar[];
  now: number;
}

export interface EvalResult {
  triggered: boolean;
  /** Price that met the condition. */
  price?: number;
  /** Time it happened (bar start, epoch ms). */
  at?: number;
  message?: string;
}

const NO: EvalResult = { triggered: false };

const etTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const fmtTime = (t: number) => `${etTime.format(new Date(t))} ET`;
const fmtPx = (p: number) => (p >= 1 ? p.toFixed(2) : p.toFixed(4));
const TF_LABEL: Record<AlertTimeframe, string> = { "5": "5-min", "15": "15-min", "60": "1-hour", D: "daily" };

/* ----------------------------------------------------------------------------
 * Trading time (for trendlines)
 * ------------------------------------------------------------------------- */

const SESSIONS = {
  regular: [9 * 60 + 30, 16 * 60],
  extended: [4 * 60, 20 * 60],
} as const;

const etParts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
function etDay(ts: number) {
  const p = Object.fromEntries(etParts.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, weekend: p.weekday === "Sat" || p.weekday === "Sun" };
}

/**
 * Trading minutes from a to b (negative if b < a). Charts skip nights and
 * weekends, so a line that is straight on the chart is straight in trading
 * time, not clock time. Market holidays are not excluded.
 */
export function tradingMinutesBetween(a: number, b: number, session: "regular" | "extended"): number {
  if (b < a) return -tradingMinutesBetween(b, a, session);
  const [openMin, closeMin] = SESSIONS[session];
  let total = 0;
  // Walk New York calendar days from a's day to b's day (at noon UTC to stay on the right date).
  const start = etDay(a);
  let cursor = Date.UTC(start.y, start.m - 1, start.d, 12);
  for (let i = 0; i < 4000; i++) {
    const day = etDay(cursor);
    const open = etWallTimeToEpoch(day.y, day.m, day.d, Math.floor(openMin / 60), openMin % 60);
    const close = etWallTimeToEpoch(day.y, day.m, day.d, Math.floor(closeMin / 60), closeMin % 60);
    if (open > b) break;
    if (!day.weekend) {
      const from = Math.max(a, open);
      const to = Math.min(b, close);
      if (to > from) total += (to - from) / 60_000;
    }
    cursor += 86_400_000;
  }
  return total;
}

/** Value of the line at time t, or null where the line doesn't exist. */
export function lineValueAt(line: AlertLine, t: number): number | null {
  const [p1, p2] = line.points;
  if (line.kind === "horizontal") return p1.v;
  const span = tradingMinutesBetween(p1.t, p2.t, line.session);
  if (span === 0) return null;
  const x = tradingMinutesBetween(p1.t, t, line.session);
  const frac = x / span;
  if (line.kind === "segment" && (frac < 0 || frac > 1)) return null;
  if (line.kind === "ray" && frac < 0) return null;
  return p1.v + (p2.v - p1.v) * frac;
}

/* ----------------------------------------------------------------------------
 * Evaluation
 * ------------------------------------------------------------------------- */

function completedBars(ctx: EvalContext): Bar[] {
  const bars = ctx.tfBars ?? [];
  const len = ctx.tfMs ?? 0;
  return len > 0 ? bars.filter((b) => b.t + len <= ctx.now) : bars.slice(0, -1);
}

export function evaluateAlert(alert: AlertRow, ctx: EvalContext): EvalResult {
  const target = Number(alert.target_value);
  const bars = ctx.minuteBars ?? [];
  const sym = alert.symbol.toUpperCase();

  switch (alert.alert_type as AlertType) {
    case "price_above": {
      const hit = bars.find((b) => b.h >= target);
      return hit ? { triggered: true, price: Math.max(hit.o, target), at: hit.t, message: `${sym} traded at or above ${fmtPx(target)} (high ${fmtPx(hit.h)} at ${fmtTime(hit.t)}).` } : NO;
    }
    case "price_below": {
      const hit = bars.find((b) => b.l <= target);
      return hit ? { triggered: true, price: Math.min(hit.o, target), at: hit.t, message: `${sym} traded at or below ${fmtPx(target)} (low ${fmtPx(hit.l)} at ${fmtTime(hit.t)}).` } : NO;
    }
    case "percent_change": {
      const pc = ctx.prevClose;
      if (!pc || !(target > 0)) return NO;
      for (const b of bars) {
        const up = ((b.h - pc) / pc) * 100;
        const down = ((b.l - pc) / pc) * 100;
        if (up >= target) return { triggered: true, price: b.h, at: b.t, message: `${sym} is up ${up.toFixed(2)}% from yesterday's close (${fmtPx(pc)}) at ${fmtTime(b.t)}.` };
        if (-down >= target) return { triggered: true, price: b.l, at: b.t, message: `${sym} is down ${(-down).toFixed(2)}% from yesterday's close (${fmtPx(pc)}) at ${fmtTime(b.t)}.` };
      }
      return NO;
    }
    case "volume_spike": {
      const recent = ctx.recentMinuteBars ?? [];
      const avg = ctx.avgMinuteVolume ?? 0;
      if (recent.length < 10 || !(avg > 0) || !(target > 0)) return NO;
      const vol = recent.reduce((s, b) => s + b.v, 0);
      const expected = avg * recent.length;
      const mult = vol / expected;
      return mult >= target
        ? { triggered: true, price: recent[recent.length - 1].c, at: recent[recent.length - 1].t, message: `${sym} volume over the last ${recent.length} minutes is ${mult.toFixed(1)}× normal (${Math.round(vol).toLocaleString("en-US")} shares).` }
        : NO;
    }
    case "rsi_overbought":
    case "rsi_oversold": {
      const done = completedBars(ctx);
      if (done.length < 16) return NO;
      const over = alert.alert_type === "rsi_overbought";
      const level = target > 0 && target < 100 ? target : over ? 70 : 30;
      const rsi = rsiSeries(done.map((b) => b.c), 14);
      const cur = rsi[rsi.length - 1];
      const prev = rsi[rsi.length - 2];
      if (!Number.isFinite(cur) || !Number.isFinite(prev)) return NO;
      const crossed = over ? prev < level && cur >= level : prev > level && cur <= level;
      const last = done[done.length - 1];
      const tf = TF_LABEL[alert.condition?.timeframe ?? "15"];
      return crossed
        ? { triggered: true, price: last.c, at: last.t, message: `${sym} RSI(14) on the ${tf} chart crossed ${over ? "above" : "below"} ${level} (${cur.toFixed(1)}).` }
        : NO;
    }
    case "macd_cross": {
      const done = completedBars(ctx);
      if (done.length < 40) return NO;
      const m = macd(done.map((b) => b.c));
      const n = done.length - 1;
      const d1 = m.line[n] - m.signal[n];
      const d0 = m.line[n - 1] - m.signal[n - 1];
      if (!Number.isFinite(d1) || !Number.isFinite(d0) || Math.sign(d1) === Math.sign(d0) || d1 === 0) return NO;
      const dir = alert.condition?.direction ?? "any";
      const up = d1 > 0;
      if ((dir === "up" && !up) || (dir === "down" && up)) return NO;
      const tf = TF_LABEL[alert.condition?.timeframe ?? "15"];
      return { triggered: true, price: done[n].c, at: done[n].t, message: `${sym} MACD crossed ${up ? "above" : "below"} its signal line on the ${tf} chart.` };
    }
    case "sma_cross": {
      const period = Math.round(target) >= 2 && Math.round(target) <= 400 ? Math.round(target) : 50;
      const done = completedBars(ctx);
      if (done.length < period + 2) return NO;
      const closes = done.map((b) => b.c);
      const avg = sma(closes, period);
      const n = closes.length - 1;
      const above1 = closes[n] > avg[n];
      const above0 = closes[n - 1] > avg[n - 1];
      if (!Number.isFinite(avg[n]) || !Number.isFinite(avg[n - 1]) || above1 === above0) return NO;
      const dir = alert.condition?.direction ?? "any";
      if ((dir === "up" && !above1) || (dir === "down" && above1)) return NO;
      const tf = TF_LABEL[alert.condition?.timeframe ?? "15"];
      return { triggered: true, price: closes[n], at: done[n].t, message: `${sym} closed ${above1 ? "above" : "below"} its ${period}-bar average (${fmtPx(avg[n])}) on the ${tf} chart.` };
    }
    case "line_cross": {
      const line = alert.condition?.line;
      if (!line || bars.length === 0) return NO;
      const dir = alert.condition?.direction ?? "any";
      let prev = typeof alert.last_price === "number" && Number.isFinite(alert.last_price) ? alert.last_price : bars[0].o;
      for (const b of bars) {
        const v = lineValueAt(line, b.t);
        if (v !== null) {
          const up = prev < v && b.h >= v;
          const down = prev > v && b.l <= v;
          if ((up && dir !== "down") || (down && dir !== "up")) {
            return { triggered: true, price: v, at: b.t, message: `${sym} crossed ${up ? "above" : "below"} your line at ${fmtPx(v)} (${fmtTime(b.t)}).` };
          }
        }
        prev = b.c;
      }
      return NO;
    }
    default:
      return NO;
  }
}

/** Timeframe bar length in ms. */
export const timeframeMs = (tf: AlertTimeframe | undefined) =>
  tf === "5" ? 5 * 60_000 : tf === "60" ? 60 * 60_000 : tf === "D" ? 86_400_000 : 15 * 60_000;

export const needsTimeframeBars = (type: string) => ["rsi_overbought", "rsi_oversold", "macd_cross", "sma_cross"].includes(type);
