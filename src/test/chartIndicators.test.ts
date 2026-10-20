import { describe, it, expect } from "vitest";
import * as C from "@/components/charts/indicators/calc";
import { INDICATOR_TEMPLATES, resolveIndicator, RETIRED_INDICATOR_IDS } from "@/components/charts/indicators/registry";
import { AVAILABLE_INDICATORS } from "@/components/charts/IndicatorPanel";

/** Deterministic random-walk OHLCV, one bar per trading-day-ish step. */
function makeBars(n = 300, stepMs = 86_400_000): C.Bars {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const b: C.Bars = { timestamp: [], open: [], high: [], low: [], close: [], volume: [] };
  let p = 50;
  for (let i = 0; i < n; i++) {
    const o = p;
    p = p * (1 + (rnd() - 0.5) * 0.04);
    b.timestamp.push(Date.UTC(2026, 0, 2, 15) + i * stepMs);
    b.open.push(o);
    b.high.push(Math.max(o, p) * (1 + rnd() * 0.01));
    b.low.push(Math.min(o, p) * (1 - rnd() * 0.01));
    b.close.push(p);
    b.volume.push(Math.round(1e5 + rnd() * 1e6));
  }
  return b;
}

const flat = (closes: number[], timestamps?: number[]): C.Bars => ({
  timestamp: timestamps ?? closes.map((_, i) => i * 60_000),
  open: closes,
  high: closes,
  low: closes,
  close: closes,
  volume: closes.map(() => 100),
});

describe("indicator math", () => {
  it("SMA and EMA match hand calculations", () => {
    const s = C.sma([1, 2, 3, 4, 5], 3);
    expect(s.slice(0, 2).every(Number.isNaN)).toBe(true);
    expect(s.slice(2)).toEqual([2, 3, 4]);
    // EMA(3) seeds with SMA(1,2,3)=2, then k=0.5: 0.5*4+0.5*2=3, 0.5*5+0.5*3=4
    expect(C.ema([1, 2, 3, 4, 5], 3).slice(2)).toEqual([2, 3, 4]);
  });

  it("RSI is 100 when price only rises and ~50 for alternating moves", () => {
    const up = Array.from({ length: 40 }, (_, i) => 100 + i);
    expect(C.rsiSeries(up, 14).at(-1)).toBe(100);
    const alt = Array.from({ length: 200 }, (_, i) => 100 + (i % 2));
    expect(C.rsiSeries(alt, 14).at(-1)).toBeGreaterThan(45);
    expect(C.rsiSeries(alt, 14).at(-1)).toBeLessThan(55);
  });

  it("SMA(20) stays valid on every bar (the library's 'SMA' went NaN after one bar)", () => {
    const b = makeBars(100);
    const s = C.sma(b.close, 20);
    expect(s.slice(19).every(Number.isFinite)).toBe(true);
  });

  it("VWAP is the volume-weighted typical price and resets each New York day", () => {
    // Two bars on Oct 19 (ET) and one on Oct 20 (ET), 1 minute apart around ET midnight.
    const day1a = Date.parse("2026-10-19T23:58:00-04:00");
    const day1b = Date.parse("2026-10-19T23:59:00-04:00");
    const day2 = Date.parse("2026-10-20T00:00:00-04:00");
    const b: C.Bars = {
      timestamp: [day1a, day1b, day2],
      open: [10, 20, 30],
      high: [10, 20, 30],
      low: [10, 20, 30],
      close: [10, 20, 30],
      volume: [100, 300, 50],
    };
    const v = C.vwap(b).value;
    expect(v[0]).toBeCloseTo(10);
    expect(v[1]).toBeCloseTo((10 * 100 + 20 * 300) / 400);
    expect(v[2]).toBeCloseTo(30); // new session
  });

  it("Supertrend is below price in a steady uptrend", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + i);
    const b: C.Bars = { ...flat(closes), high: closes.map((c) => c + 1), low: closes.map((c) => c - 1) };
    const st = C.supertrend(b, 10, 3);
    expect(st.up.at(-1)).toBeLessThan(closes.at(-1)!);
    expect(Number.isNaN(st.down.at(-1)!)).toBe(true);
  });

  it("Ichimoku leading spans are shifted forward 26 bars", () => {
    const b = makeBars(200);
    const r = C.ichimoku(b, 9, 26, 52, 26);
    const i = 150;
    expect(r.spanA[i]).toBeCloseTo((r.tenkan[i - 25] + r.kijun[i - 25]) / 2);
    expect(r.chikou[i]).toBe(b.close[i + 25]);
  });

  it("Parabolic SAR flips sides and stays outside the bar range", () => {
    const b = makeBars(300);
    const sar = C.parabolicSar(b);
    let below = 0;
    let above = 0;
    for (let i = 2; i < sar.length; i++) {
      if (sar[i] <= b.low[i]) below++;
      else if (sar[i] >= b.high[i]) above++;
    }
    expect(below).toBeGreaterThan(0);
    expect(above).toBeGreaterThan(0);
  });

  it("swing levels still find a top when two bars share the same high", () => {
    //            0    1    2    3    4    5    6    7    8    9   10   11   12
    const highs = [10, 11, 12, 13, 14, 15, 15, 14, 13, 12, 11, 10, 9];
    const b: C.Bars = { ...flat(highs), high: highs, low: highs.map((h) => h - 1) };
    const r = C.swingLevels(b, 5);
    expect(r.high.at(-1)).toBe(15);
  });

  it("ZigZag only connects swings of at least the deviation", () => {
    const closes = [100, 103, 110, 104, 98, 99, 108, 112];
    const z = C.zigzag(flat(closes), 5);
    expect(z[0]).toBe(100);
    expect(z[2]).toBe(110);
    expect(z[4]).toBe(98);
  });
});

describe("indicator registry", () => {
  it("every template computes a full-length result without throwing", () => {
    const b = makeBars(300, 5 * 60_000);
    for (const t of INDICATOR_TEMPLATES) {
      const out = t.compute(b, t.calcParams);
      for (const f of t.figures) {
        const series = out[f.key];
        expect(series, `${t.name}.${f.key}`).toBeDefined();
        expect(series.length, `${t.name}.${f.key}`).toBe(300);
        expect(series.some(Number.isFinite), `${t.name}.${f.key} has values`).toBe(true);
      }
    }
  });

  it("every indicator in the panel resolves to a real implementation", () => {
    const missing = AVAILABLE_INDICATORS.map((d) => d.id).filter((id) => !resolveIndicator(id));
    expect(missing).toEqual([]);
  });

  it("panel ids map to the indicator they are named after", () => {
    expect(resolveIndicator("VWAP")?.name).toBe("KF_VWAP");
    expect(resolveIndicator("Ichimoku")?.name).toBe("KF_ICHIMOKU");
    expect(resolveIndicator("Supertrend")?.name).toBe("KF_SUPERTREND");
    expect(resolveIndicator("MFI(14)")?.name).toBe("KF_MFI");
    expect(resolveIndicator("KC(20,1.5)")).toMatchObject({ name: "KF_KC", calcParams: [20, 1.5, 10], overlay: true });
    expect(resolveIndicator("BBW")?.name).toBe("KF_BBW");
    expect(resolveIndicator("BB%B")?.name).toBe("KF_BBPB");
    expect(resolveIndicator("BB(10,1.5)")).toMatchObject({ name: "KF_BB", calcParams: [10, 1.5] });
    expect(resolveIndicator("NATR(14)")?.name).toBe("KF_NATR");
    expect(resolveIndicator("ADX(14)")?.name).toBe("KF_ADX");
    expect(resolveIndicator("AD")?.name).toBe("KF_AD");
    expect(resolveIndicator("SMA(200)")).toMatchObject({ name: "KF_SMA", calcParams: [200], overlay: true });
    expect(resolveIndicator("RSI(7)")).toMatchObject({ name: "KF_RSI", calcParams: [7], overlay: false, paneId: "rsi_pane" });
  });

  it("retired ids (need a benchmark or are drawings) are not offered", () => {
    for (const id of RETIRED_INDICATOR_IDS) {
      expect(AVAILABLE_INDICATORS.some((d) => d.id === id)).toBe(false);
    }
  });

  it("panel has no duplicate ids", () => {
    const ids = AVAILABLE_INDICATORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
