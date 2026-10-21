import { describe, it, expect } from "vitest";
import { addTick } from "@/lib/marketData/tickCandles";

describe("candles from ticks", () => {
  it("tracks open/high/low/close inside a minute and hands back the finished candle", () => {
    let r = addTick(null, 1.1, 60_000 * 10 + 5);
    expect(r.finished).toBeNull();
    r = addTick(r.candle, 1.3, 60_000 * 10 + 20_000);
    r = addTick(r.candle, 1.0, 60_000 * 10 + 40_000);
    r = addTick(r.candle, 1.2, 60_000 * 10 + 59_000);
    expect(r.candle).toMatchObject({ open: 1.1, high: 1.3, low: 1.0, close: 1.2, ticks: 4 });
    const next = addTick(r.candle, 1.25, 60_000 * 11 + 1);
    expect(next.finished).toMatchObject({ start: 600_000, open: 1.1, high: 1.3, low: 1.0, close: 1.2 });
    expect(next.candle).toMatchObject({ start: 660_000, open: 1.25, ticks: 1 });
  });
  it("ignores bad prices and late ticks", () => {
    const a = addTick(null, 2, 120_000).candle;
    expect(addTick(a, NaN, 120_001).candle).toBe(a);
    expect(addTick(a, 3, 60_000)).toEqual({ candle: a, finished: null });
  });
});
