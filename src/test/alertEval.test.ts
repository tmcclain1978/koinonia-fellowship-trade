import { describe, it, expect } from "vitest";
import { rsiSeries } from "../../supabase/functions/_shared/indicator-calc";
import {
  evaluateAlert, tradingMinutesBetween, lineValueAt, type AlertRow, type Bar, type AlertLine,
} from "../../supabase/functions/_shared/alert-eval";

const et = (iso: string) => Date.parse(iso);
const bar = (iso: string, o: number, h: number, l: number, c: number, v = 1000): Bar => ({ t: et(iso), o, h, l, c, v });
const alert = (a: Partial<AlertRow>): AlertRow => ({ id: "a1", symbol: "AAPL", alert_type: "price_above", target_value: 200, ...a });
const NOW = et("2026-10-20T10:35:00-04:00");

describe("price alerts", () => {
  it("fires when a 1-minute high touches the level, even if price came back", () => {
    const r = evaluateAlert(alert({}), {
      now: NOW,
      minuteBars: [bar("2026-10-20T10:31:00-04:00", 199.5, 199.9, 199.4, 199.8), bar("2026-10-20T10:32:00-04:00", 199.8, 200.05, 199.7, 199.85)],
    });
    expect(r.triggered).toBe(true);
    expect(r.at).toBe(et("2026-10-20T10:32:00-04:00"));
    expect(r.message).toMatch(/at or above 200\.00 \(high 200\.05 at 10:32 AM ET\)/);
  });

  it("does not fire when the level wasn't reached", () => {
    expect(evaluateAlert(alert({}), { now: NOW, minuteBars: [bar("2026-10-20T10:31:00-04:00", 199, 199.99, 198, 199)] }).triggered).toBe(false);
    expect(evaluateAlert(alert({ alert_type: "price_below", target_value: 190 }), { now: NOW, minuteBars: [bar("2026-10-20T10:31:00-04:00", 191, 192, 190.01, 191)] }).triggered).toBe(false);
  });

  it("percent change is measured from yesterday's close, either direction", () => {
    const down = evaluateAlert(alert({ alert_type: "percent_change", target_value: 3 }), {
      now: NOW, prevClose: 100, minuteBars: [bar("2026-10-20T10:31:00-04:00", 98, 98.5, 96.9, 97)],
    });
    expect(down.triggered).toBe(true);
    expect(down.message).toMatch(/down 3\.10%/);
  });

  it("volume spike compares the last minutes with normal per-minute volume", () => {
    const recent = Array.from({ length: 15 }, (_, i) => bar(`2026-10-20T10:${String(20 + i).padStart(2, "0")}:00-04:00`, 1, 1, 1, 1, 3000));
    const hit = evaluateAlert(alert({ alert_type: "volume_spike", target_value: 2.5 }), { now: NOW, minuteBars: [], recentMinuteBars: recent, avgMinuteVolume: 1000 });
    expect(hit.triggered).toBe(true);
    expect(hit.message).toMatch(/3\.0× normal/);
    expect(evaluateAlert(alert({ alert_type: "volume_spike", target_value: 4 }), { now: NOW, minuteBars: [], recentMinuteBars: recent, avgMinuteVolume: 1000 }).triggered).toBe(false);
  });
});

describe("indicator alerts use completed bars only", () => {
  // 15-minute bars that fall steadily, then rise sharply in the last completed bar.
  const tf = (closes: number[], start = et("2026-10-19T09:30:00-04:00")) =>
    closes.map((c, i) => ({ t: start + i * 15 * 60_000, o: c, h: c + 0.2, l: c - 0.2, c, v: 1000 }));

  it("RSI crossing above 70 fires once the bar has closed", () => {
    const all = [...Array.from({ length: 30 }, (_, i) => 100 - i * 0.1 + (i % 2) * 0.15), ...Array.from({ length: 10 }, (_, i) => 97.5 + i * 1.2)];
    // End the data on the bar where RSI first crosses above 70.
    const rsi = rsiSeries(all, 14);
    const cross = rsi.findIndex((v, i) => i > 0 && rsi[i - 1] < 70 && v >= 70);
    expect(cross).toBeGreaterThan(0);
    const bars = tf(all.slice(0, cross + 1));
    const lastStart = bars[bars.length - 1].t;
    const ctx = (now: number) => ({ now, minuteBars: [], tfBars: bars, tfMs: 15 * 60_000 });
    const a = alert({ alert_type: "rsi_overbought", target_value: 70, condition: { timeframe: "15" } });
    // Last bar still forming -> ignored.
    expect(evaluateAlert(a, ctx(lastStart + 5 * 60_000)).triggered).toBe(false);
    const r = evaluateAlert(a, ctx(lastStart + 15 * 60_000));
    expect(r.triggered).toBe(true);
    expect(r.message).toMatch(/RSI\(14\) on the 15-min chart crossed above 70/);
  });

  it("SMA cross uses the alert's number as the period and respects direction", () => {
    const closes = [...Array.from({ length: 25 }, () => 100), 99, 98, 103];
    const bars = tf(closes);
    const now = bars[bars.length - 1].t + 15 * 60_000;
    const up = alert({ alert_type: "sma_cross", target_value: 20, condition: { timeframe: "15", direction: "up" } });
    expect(evaluateAlert(up, { now, minuteBars: [], tfBars: bars, tfMs: 15 * 60_000 }).message).toMatch(/closed above its 20-bar average/);
    const down = alert({ alert_type: "sma_cross", target_value: 20, condition: { timeframe: "15", direction: "down" } });
    expect(evaluateAlert(down, { now, minuteBars: [], tfBars: bars, tfMs: 15 * 60_000 }).triggered).toBe(false);
  });
});

describe("trendline alerts follow the line as drawn on the chart", () => {
  it("counts trading minutes, skipping nights and weekends", () => {
    // Friday 3:30 pm -> Monday 10:00 am = 30 min Friday + 30 min Monday.
    expect(tradingMinutesBetween(et("2026-10-16T15:30:00-04:00"), et("2026-10-19T10:00:00-04:00"), "regular")).toBe(60);
    // Extended hours: Fri 15:30-20:00 (270) + Mon 4:00-10:00 (360).
    expect(tradingMinutesBetween(et("2026-10-16T15:30:00-04:00"), et("2026-10-19T10:00:00-04:00"), "extended")).toBe(630);
  });

  const line: AlertLine = {
    kind: "ray",
    session: "regular",
    // Drawn Friday 3:00 pm at 100 to Friday 3:30 pm at 101: +1 per 30 trading minutes.
    points: [{ t: et("2026-10-16T15:00:00-04:00"), v: 100 }, { t: et("2026-10-16T15:30:00-04:00"), v: 101 }],
  };

  it("extends across the weekend the way the chart shows it", () => {
    // Monday 10:00 is 90 trading minutes after the first point (Fri 3-4 pm + Mon 9:30-10) -> 103.
    // Measured in clock time it would be ~134 (over 3 days), far from the line on the chart.
    expect(lineValueAt(line, et("2026-10-19T10:00:00-04:00"))).toBeCloseTo(103, 6);
    // A ray doesn't exist before its first point.
    expect(lineValueAt(line, et("2026-10-16T14:00:00-04:00"))).toBeNull();
    expect(lineValueAt({ ...line, kind: "segment" }, et("2026-10-19T10:00:00-04:00"))).toBeNull();
  });

  it("fires when price crosses the line in the chosen direction", () => {
    const a = alert({ alert_type: "line_cross", condition: { line, direction: "up" }, last_price: 102.5 });
    const crossing = [bar("2026-10-19T10:00:00-04:00", 102.6, 103.1, 102.5, 103.05)];
    const r = evaluateAlert(a, { now: NOW, minuteBars: crossing });
    expect(r.triggered).toBe(true);
    expect(r.price).toBeCloseTo(103, 6);
    expect(r.message).toMatch(/crossed above your line at 103\.00/);
    // Down-only alert ignores an upward cross.
    expect(evaluateAlert({ ...a, condition: { line, direction: "down" } }, { now: NOW, minuteBars: crossing }).triggered).toBe(false);
  });

  it("does not fire when price stays on one side", () => {
    const a = alert({ alert_type: "line_cross", condition: { line }, last_price: 104 });
    expect(evaluateAlert(a, { now: NOW, minuteBars: [bar("2026-10-19T10:00:00-04:00", 104, 104.5, 103.2, 104)] }).triggered).toBe(false);
  });
});
