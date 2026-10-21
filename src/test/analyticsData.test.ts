import { describe, it, expect } from "vitest";
import { alignReturns, dailyReturns, normalizeBars } from "@/lib/marketData/history";
import { optionsView, priceViews } from "@/lib/analytics/analyticsViews";
import { parseChain } from "@/components/charts/options/optionsLevels";

const day = (d: string) => Date.parse(`${d}T20:00:00Z`) / 1000;

describe("real price history helpers", () => {
  it("normalizes candle rows (seconds, ms, ISO) and drops bad or duplicate ones", () => {
    const bars = normalizeBars([
      { time: day("2026-10-02"), open: 1, high: 2, low: 1, close: 1.5, volume: 10 },
      { timestamp: day("2026-10-01") * 1000, open: 1, high: 2, low: 1, close: 1.2 },
      { datetime: "2026-10-03T20:00:00Z", open: 1, high: 2, low: 1, close: 1.8, volume: 5 },
      { time: day("2026-10-02"), open: 1, high: 2, low: 1, close: 9, volume: 1 },
      { time: day("2026-10-04"), open: 1, high: 2, low: 1, close: 0 },
      null,
    ]);
    expect(bars.map((b) => b.c)).toEqual([1.2, 1.5, 1.8]);
    expect(bars[0].v).toBe(0);
  });

  it("daily returns line up by date across two symbols", () => {
    const a = normalizeBars(["01", "02", "05"].map((d, i) => ({ time: day(`2026-10-${d}`), open: 1, high: 1, low: 1, close: [100, 110, 99][i] })));
    const b = normalizeBars(["01", "02", "03", "05"].map((d, i) => ({ time: day(`2026-10-${d}`), open: 1, high: 1, low: 1, close: [50, 50, 55, 55][i] })));
    const ra = dailyReturns(a);
    expect(ra.get("2026-10-02")).toBeCloseTo(0.1);
    const al = alignReturns(ra, dailyReturns(b));
    expect(al.dates).toEqual(["2026-10-02", "2026-10-05"]);
    expect(al.b).toEqual([0, 0]);
  });
});

describe("Analytics page views", () => {
  it("last bars with RSI and MACD from the full history", () => {
    const bars = Array.from({ length: 80 }, (_, i) => ({ t: Date.parse("2026-10-01T13:30:00Z") + i * 300_000, o: 100, h: 101, l: 99, c: 100 + Math.sin(i / 5) * 2, v: 1000 + i }));
    const v = priceViews(bars, false, 40);
    expect(v.volume).toHaveLength(40);
    expect(v.volume[39]).toMatchObject({ volume: 1079 });
    expect(v.technicals.every((x) => x.rsi !== null && x.rsi >= 0 && x.rsi <= 100)).toBe(true);
    expect(v.technicals[39].macd).not.toBeNull();
  });

  it("nearest expiration, strikes around the price, prices / IV / open interest", () => {
    const now = Date.parse("2026-10-21T14:00:00Z");
    const raw = [];
    for (const exp of ["2026-10-21", "2026-10-23", "2026-10-30"])
      for (const k of [90, 95, 100, 105, 110, 115])
        for (const type of ["CALL", "PUT"]) raw.push({ type, strike: k, expiration: exp, bid: 1, ask: 1.2, volume: 10, openInterest: 100, impliedVolatility: 30 });
    const chain = parseChain(raw, now);
    const v = optionsView(chain, 101, 3)!;
    expect(v.expiration).toBe("2026-10-23"); // same-day expiry skipped
    expect(v.heatmap.map((h) => h.strike)).toEqual([95, 100, 105]);
    expect(v.heatmap[0]).toEqual({ strike: 95, call: 1.1, put: 1.1, volume: 20 });
    expect(v.ivOi.filter((x) => x.type === "put").map((x) => x.iv)).toEqual([30, 30, 30]);
    expect(optionsView([], 100)).toBeNull();
  });
});
