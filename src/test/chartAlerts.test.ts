import { describe, it, expect } from "vitest";
import {
  alertLineFromDrawing, lineAlert, priceAlertAt, describeAlert, isArmed, toChartAlert, movedLevelType, alertChartShape,
} from "@/components/charts/alerts/chartAlerts";
import { extendLine } from "@/components/charts/alerts/alertLineOverlay";
import { lineValueAt } from "../../supabase/functions/_shared/alert-eval";

const t = (iso: string) => Date.parse(iso);

describe("alerts from the chart", () => {
  it("a level above the price is an 'above' alert, below is 'below'", () => {
    expect(priceAlertAt("aapl", 205, 200)).toMatchObject({ symbol: "AAPL", alert_type: "price_above", target_value: 205, frequency: "once", notify_email: true });
    expect(priceAlertAt("AAPL", 195, 200).alert_type).toBe("price_below");
  });

  it("clamps the repeat pause and trims notes", () => {
    const a = priceAlertAt("AAPL", 1, 2, { frequency: "repeat", cooldownMinutes: 0, notes: "  hi  " });
    expect(a.cooldown_minutes).toBe(1);
    expect(a.notes).toBe("hi");
    expect(priceAlertAt("AAPL", 1, 2, { notes: "   " }).notes).toBeNull();
  });

  it("turns a trend line into a line alert measured in the chart's session", () => {
    const d = { name: "rayLine", points: [{ timestamp: t("2026-10-16T15:00:00-04:00"), value: 100 }, { timestamp: t("2026-10-16T15:30:00-04:00"), value: 101 }] };
    const line = alertLineFromDrawing(d, { extendedHours: false, intraday: true })!;
    expect(line).toMatchObject({ kind: "ray", session: "regular" });
    expect(alertLineFromDrawing(d, { extendedHours: true, intraday: true })!.session).toBe("extended");
    // Daily chart: regular session even with extended hours on.
    expect(alertLineFromDrawing(d, { extendedHours: true, intraday: false })!.session).toBe("regular");
    const a = lineAlert("AAPL", line, "up", 100);
    expect(a.alert_type).toBe("line_cross");
    expect(a.condition).toEqual({ line, direction: "up" });
    // Same line value the server will use.
    expect(lineValueAt(line, t("2026-10-19T10:00:00-04:00"))).toBeCloseTo(103, 6);
  });

  it("a horizontal drawing becomes a plain price alert", () => {
    const line = alertLineFromDrawing({ name: "horizontalStraightLine", points: [{ timestamp: 1, value: 150 }] }, { extendedHours: false, intraday: true })!;
    expect(lineAlert("AAPL", line, "any", 140)).toMatchObject({ alert_type: "price_above", target_value: 150, condition: null });
  });

  it("ignores shapes that aren't lines, and vertical lines", () => {
    expect(alertLineFromDrawing({ name: "rect", points: [{ timestamp: 1, value: 1 }, { timestamp: 2, value: 2 }] }, { extendedHours: false, intraday: true })).toBeNull();
    expect(alertLineFromDrawing({ name: "segment", points: [{ timestamp: 5, value: 1 }, { timestamp: 5, value: 2 }] }, { extendedHours: false, intraday: true })).toBeNull();
  });

  it("dragging a level across the price flips its direction", () => {
    expect(movedLevelType(210, 200, "price_below")).toBe("price_above");
    expect(movedLevelType(190, 200, "price_above")).toBe("price_below");
    expect(movedLevelType(190, null, "price_above")).toBe("price_above");
  });
});

describe("alert rows", () => {
  const row = { id: "1", symbol: "aapl", alert_type: "price_above", target_value: "200.5", is_active: true, is_triggered: true, frequency: null, created_at: "x" };

  it("normalizes nullable columns", () => {
    const a = toChartAlert(row);
    expect(a).toMatchObject({ symbol: "AAPL", target_value: 200.5, frequency: "once", cooldown_minutes: 60, notify_email: true, trigger_count: 0 });
    expect(isArmed(a)).toBe(false); // fired one-time alert
    expect(isArmed({ ...a, frequency: "repeat" })).toBe(true);
    expect(isArmed({ ...a, is_triggered: false, is_active: false })).toBe(false);
  });

  it("describes alerts briefly", () => {
    expect(describeAlert({ alert_type: "price_below", target_value: 0.5123, condition: null })).toBe("Price ≤ 0.5123");
    expect(describeAlert({ alert_type: "sma_cross", target_value: 20, condition: { timeframe: "60", direction: "up" } })).toBe("Close crosses SMA 20 (1h) ↑");
    expect(describeAlert({ alert_type: "rsi_oversold", target_value: 0, condition: null })).toBe("RSI 15m crosses below 30");
  });

  it("only level and line alerts are drawn", () => {
    expect(alertChartShape(toChartAlert(row))).toEqual({ type: "level", price: 200.5 });
    expect(alertChartShape(toChartAlert({ ...row, alert_type: "macd_cross" }))).toBeNull();
  });
});

describe("drawing alert lines", () => {
  it("extends rays and lines to the chart edges", () => {
    const a = { x: 100, y: 200 }, b = { x: 200, y: 100 };
    expect(extendLine(a, b, 1000, "segment")).toEqual([a, b]);
    expect(extendLine(a, b, 1000, "ray")).toEqual([a, { x: 1000, y: -700 }]);
    expect(extendLine(a, b, 1000, "extended")).toEqual([{ x: 0, y: 300 }, { x: 1000, y: -700 }]);
    // A ray drawn right-to-left extends to the left edge.
    expect(extendLine(b, a, 1000, "ray")[1]).toEqual({ x: 0, y: 300 });
  });
});
