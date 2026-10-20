import { describe, it, expect, beforeEach } from "vitest";
import { olderRange, olderCandlesOnly, pageSpanDays } from "@/components/charts/historyPaging";
import { buildPriceTicks } from "@/components/charts/priceTicks";
import { sanitizeDrawings, saveDrawings, getSavedDrawings } from "@/components/charts/state/chartDrawings";

const et = (iso: string) => Date.parse(iso);
const bar = (ts: number) => ({ timestamp: ts, open: 1, high: 1, low: 1, close: 1, volume: 1 });

describe("history paging", () => {
  it("asks for the page that ends on the oldest loaded day (New York date)", () => {
    // 9:30 pm ET Oct 19 is already Oct 20 in UTC; the request must still end on Oct 19.
    expect(olderRange(et("2026-10-19T21:30:00-04:00"), "5")).toEqual({ startDate: "2026-09-29", endDate: "2026-10-19" });
    expect(olderRange(et("2026-10-19T10:00:00-04:00"), "D")?.startDate).toBe("2024-10-19");
  });

  it("doesn't page monthly charts", () => {
    expect(pageSpanDays("M")).toBeNull();
    expect(olderRange(Date.now(), "M")).toBeNull();
  });

  it("keeps only older candles, sorted and without duplicates", () => {
    const oldest = 1_000;
    const got = olderCandlesOnly([bar(900), bar(1_000), bar(700), bar(900), bar(1_200)], oldest);
    expect(got.map((c) => c.timestamp)).toEqual([700, 900]);
  });
});

describe("price axis ticks", () => {
  const params = {
    range: { from: 100, to: 110, realFrom: 100, realRange: 10 },
    bounding: { height: 500 },
    defaultTicks: [{ coord: 1, value: 0, text: "default" }],
  };

  it("places each label at its price, not all at the top (coord was always 0)", () => {
    const ticks = buildPriceTicks(params, 10, () => 2);
    expect(ticks.length).toBeGreaterThan(3);
    for (const t of ticks) {
      const expected = Math.round((1 - ((t.value as number) - 100) / 10) * 500);
      expect(t.coord).toBe(expected);
    }
    expect(new Set(ticks.map((t) => t.coord)).size).toBe(ticks.length);
  });

  it("uses round steps and enough decimals", () => {
    const ticks = buildPriceTicks(params, 10, () => 2);
    expect(ticks.map((t) => t.text)).toContain("105.00");
    const steps = ticks.slice(1).map((t, i) => +((t.value as number) - (ticks[i].value as number)).toFixed(6));
    expect(new Set(steps).size).toBe(1);
  });

  it("falls back to the library's ticks for an empty range", () => {
    expect(buildPriceTicks({ ...params, range: { from: 5, to: 5, realFrom: 5, realRange: 0 } }, 10, () => 2)).toBe(params.defaultTicks);
  });
});

describe("saved drawings", () => {
  beforeEach(() => localStorage.clear());

  it("saves and restores drawings per symbol by time and price", () => {
    const line = { name: "segment", points: [{ timestamp: 1, value: 100 }, { timestamp: 2, value: 105 }] };
    saveDrawings("aapl", [line]);
    expect(getSavedDrawings("AAPL")).toEqual([{ ...line, styles: undefined, extendData: undefined, lock: false }]);
    expect(getSavedDrawings("MSFT")).toEqual([]);
  });

  it("drops malformed drawings instead of crashing the chart", () => {
    const clean = sanitizeDrawings([
      { name: "segment", points: [{ timestamp: 1, value: 100 }] },
      { name: "rect", points: [{ timestamp: "x", value: 1 }] },
      { points: [{ timestamp: 1, value: 1 }] },
      null,
      "junk",
    ]);
    expect(clean.map((d) => d.name)).toEqual(["segment"]);
  });

  it("saving an empty list removes the symbol's entry", () => {
    saveDrawings("AAPL", [{ name: "segment", points: [{ timestamp: 1, value: 1 }] }]);
    saveDrawings("AAPL", []);
    expect(getSavedDrawings("AAPL")).toEqual([]);
  });
});
