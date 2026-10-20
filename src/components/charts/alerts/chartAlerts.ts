/**
 * Alerts as the chart sees them. Pure, tested.
 *
 * Alerts live in the price_alerts table and are checked every minute on the
 * server (evaluate-alerts), so they fire with the browser closed.
 */
import type { AlertCondition, AlertLine, AlertTimeframe } from "../../../../supabase/functions/_shared/alert-eval";

export interface ChartAlert {
  id: string;
  symbol: string;
  alert_type: string;
  target_value: number;
  condition: AlertCondition | null;
  frequency: "once" | "repeat";
  cooldown_minutes: number;
  notify_email: boolean;
  is_active: boolean;
  is_triggered: boolean;
  triggered_at: string | null;
  trigger_message: string | null;
  trigger_count: number;
  last_checked_at: string | null;
  notes: string | null;
  created_at: string;
}

/** Normalize a price_alerts row (nullable columns, numeric strings). */
export function toChartAlert(r: Record<string, unknown>): ChartAlert {
  const cond = r.condition && typeof r.condition === "object" ? (r.condition as AlertCondition) : null;
  return {
    id: String(r.id),
    symbol: String(r.symbol ?? "").toUpperCase(),
    alert_type: String(r.alert_type ?? ""),
    target_value: Number(r.target_value) || 0,
    condition: cond,
    frequency: r.frequency === "repeat" ? "repeat" : "once",
    cooldown_minutes: Number(r.cooldown_minutes) || 60,
    notify_email: r.notify_email !== false,
    is_active: r.is_active !== false,
    is_triggered: r.is_triggered === true,
    triggered_at: (r.triggered_at as string) ?? null,
    trigger_message: (r.trigger_message as string) ?? null,
    trigger_count: Number(r.trigger_count) || 0,
    last_checked_at: (r.last_checked_at as string) ?? null,
    notes: (r.notes as string) ?? null,
    created_at: String(r.created_at ?? ""),
  };
}

/** One-time alerts that fired are done; repeating alerts stay armed. */
export const isArmed = (a: ChartAlert) => a.is_active && (a.frequency === "repeat" || !a.is_triggered);

/* ----------------------------------------------------------------------------
 * Drawings → alert lines
 * ------------------------------------------------------------------------- */

/** Drawing tools that can carry an alert, and how their line extends. */
const LINE_KINDS: Record<string, AlertLine["kind"]> = {
  segment: "segment",
  rayLine: "ray",
  straightLine: "extended",
  horizontalStraightLine: "horizontal",
  horizontalRayLine: "horizontal",
  priceLine: "horizontal",
};

export const canAlertOnDrawing = (name: string) => name in LINE_KINDS;

export interface DrawingLike {
  name: string;
  points: Array<{ timestamp?: number; value?: number }>;
}

/**
 * Turn a finished drawing into an alert line. The line's slope is measured in
 * trading time on the session the chart shows (extended hours on intraday
 * charts with pre/after-market on; regular otherwise), matching what's drawn.
 */
export function alertLineFromDrawing(d: DrawingLike, opts: { extendedHours: boolean; intraday: boolean }): AlertLine | null {
  const kind = LINE_KINDS[d.name];
  if (!kind) return null;
  const pts = d.points.filter((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.value)) as Array<{ timestamp: number; value: number }>;
  if (pts.length === 0) return null;
  const session = opts.extendedHours && opts.intraday ? "extended" : "regular";
  if (kind === "horizontal" || pts.length === 1) {
    const p = pts[0];
    return { kind: "horizontal", session, points: [{ t: p.timestamp, v: p.value }, { t: p.timestamp, v: p.value }] };
  }
  const [a, b] = pts;
  if (a.timestamp === b.timestamp) return null; // vertical: no price to cross
  return { kind, session, points: [{ t: a.timestamp, v: a.value }, { t: b.timestamp, v: b.value }] };
}

/** Alert on a horizontal drawing is just a price alert (simpler, and draggable). */
export function isHorizontal(line: AlertLine) {
  return line.kind === "horizontal" || line.points[0].v === line.points[1].v;
}

/* ----------------------------------------------------------------------------
 * Creating & labeling
 * ------------------------------------------------------------------------- */

export interface NewAlert {
  symbol: string;
  alert_type: string;
  target_value: number;
  condition: AlertCondition | null;
  frequency: "once" | "repeat";
  cooldown_minutes: number;
  notify_email: boolean;
  notes: string | null;
}

export interface AlertOptions {
  frequency?: "once" | "repeat";
  cooldownMinutes?: number;
  notifyEmail?: boolean;
  notes?: string | null;
}

const base = (symbol: string, o: AlertOptions) => ({
  symbol: symbol.toUpperCase(),
  frequency: o.frequency ?? "once",
  cooldown_minutes: Math.min(10080, Math.max(1, Math.round(o.cooldownMinutes ?? 60))),
  notify_email: o.notifyEmail ?? true,
  notes: o.notes?.trim() ? o.notes.trim().slice(0, 500) : null,
});

/**
 * A price alert at a level: "above" if the level is above the current price,
 * "below" if under it, so it fires when price moves to it, not right away.
 */
export function priceAlertAt(symbol: string, level: number, lastPrice: number | null, o: AlertOptions = {}): NewAlert {
  const above = lastPrice === null ? true : level >= lastPrice;
  return { ...base(symbol, o), alert_type: above ? "price_above" : "price_below", target_value: round(level), condition: null };
}

export function lineAlert(symbol: string, line: AlertLine, direction: "any" | "up" | "down", lastPrice: number | null, o: AlertOptions = {}): NewAlert {
  if (isHorizontal(line)) return priceAlertAt(symbol, line.points[0].v, lastPrice, o);
  return { ...base(symbol, o), alert_type: "line_cross", target_value: round(line.points[1].v), condition: { line, direction } };
}

export function indicatorAlert(symbol: string, type: string, value: number, timeframe: AlertTimeframe, direction: "any" | "up" | "down", o: AlertOptions = {}): NewAlert {
  return { ...base(symbol, o), alert_type: type, target_value: value, condition: { timeframe, direction } };
}

const round = (v: number) => Math.round(v * 10000) / 10000;
const fmt = (v: number) => (v >= 1 ? v.toFixed(2) : v.toFixed(4));
const TF: Record<string, string> = { "5": "5m", "15": "15m", "60": "1h", D: "1D" };
const DIR: Record<string, string> = { up: " ↑", down: " ↓", any: "" };

/** Short description for lists and chart labels. */
export function describeAlert(a: Pick<ChartAlert, "alert_type" | "target_value" | "condition">): string {
  const tf = TF[a.condition?.timeframe ?? "15"];
  const dir = DIR[a.condition?.direction ?? "any"];
  switch (a.alert_type) {
    case "price_above": return `Price ≥ ${fmt(a.target_value)}`;
    case "price_below": return `Price ≤ ${fmt(a.target_value)}`;
    case "percent_change": return `Moves ±${a.target_value}% on the day`;
    case "volume_spike": return `Volume ${a.target_value}× normal`;
    case "rsi_overbought": return `RSI ${tf} crosses above ${a.target_value || 70}`;
    case "rsi_oversold": return `RSI ${tf} crosses below ${a.target_value || 30}`;
    case "macd_cross": return `MACD ${tf} signal cross${dir}`;
    case "sma_cross": return `Close crosses SMA ${Math.round(a.target_value) || 50} (${tf})${dir}`;
    case "line_cross": {
      const k = a.condition?.line?.kind;
      return `Crosses ${k === "segment" ? "trend line" : k === "ray" ? "ray" : "line"}${dir}`;
    }
    default: return a.alert_type;
  }
}

/** Chart line for an alert, or null for alerts without one (indicator alerts etc.). */
export function alertChartShape(a: ChartAlert):
  | { type: "level"; price: number }
  | { type: "line"; line: AlertLine }
  | null {
  if (a.alert_type === "price_above" || a.alert_type === "price_below") return { type: "level", price: a.target_value };
  if (a.alert_type === "line_cross" && a.condition?.line) return { type: "line", line: a.condition.line };
  return null;
}

/** Moving a level alert across the current price flips its direction. */
export function movedLevelType(newLevel: number, lastPrice: number | null, current: string): string {
  if (lastPrice === null) return current;
  return newLevel >= lastPrice ? "price_above" : "price_below";
}
