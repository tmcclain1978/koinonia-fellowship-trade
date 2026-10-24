import { describe, expect, it } from "vitest";
import type { Bar } from "../../supabase/functions/_shared/patterns/detect";
import { failedFilters, passes, sameDayContext, swingContext, windowAt } from "../../supabase/functions/_shared/patterns/context";
import { MODES, moveOutcome } from "../../supabase/functions/_shared/patterns/moves";
import { earningsBlockSameDay, earningsBlockSwing, newsBlock } from "../../supabase/functions/_shared/patterns/events";
import { pickContract, realizedVol, type ChainRow } from "@/lib/options/contractPicker";

const M5 = 5 * 60_000;
const OPEN = Date.UTC(2026, 9, 21, 13, 30); // Wed Oct 21 2026, 9:30 ET

describe("market context", () => {
  it("time windows (ET, by candle close)", () => {
    expect(windowAt(OPEN)).toBe("open"); // closes 9:35
    expect(windowAt(OPEN + 6 * M5)).toBe("morning"); // closes 10:05
    expect(windowAt(OPEN + 26 * M5)).toBe("lunch"); // closes 11:45
    expect(windowAt(OPEN + 50 * M5)).toBe("afternoon"); // closes 13:45
    expect(windowAt(OPEN + 73 * M5)).toBe("close"); // closes 15:40
  });

  it("bigger trend: a dip inside an uptrend still counts as up (buy the dip)", () => {
    const bars: Bar[] = [];
    let p = 100;
    for (let k = 0; k < 200; k++) {
      const c = k > 190 ? p - 0.05 : p + 0.03; // steady climb, then a small dip
      bars.push({ time: OPEN + k * M5, open: p, close: c, high: Math.max(p, c) + 0.05, low: Math.min(p, c) - 0.05, volume: 1000 });
      p = c;
    }
    const ctx = sameDayContext(bars);
    expect(ctx[150].trend).toBe("up");
    expect(ctx[199].trend).toBe("up");
    expect(ctx[199].vwap).toBeGreaterThan(0);
    expect(passes("up", ctx[199], "up", { trend: true, market: true, lunch: false, room: false, volume: false })).toBe(true);
    expect(passes("down", ctx[199], null, { trend: true, market: false, lunch: false, room: false, volume: false })).toBe(false);
    expect(failedFilters("up", ctx[199], "down", { trend: true, market: true, lunch: false, room: false, volume: false })).toEqual(["the market is trending the other way"]);
    expect(passes("up", { trend: "up", vwap: 1, window: "lunch" }, null, { trend: false, market: false, lunch: true, room: false, volume: false })).toBe(false);
  });

  it("swing: 50-day trend", () => {
    const bars: Bar[] = Array.from({ length: 80 }, (_, i) => ({ time: i * 86_400_000, open: 100 - i * 0.5, close: 99.6 - i * 0.5, high: 100.2 - i * 0.5, low: 99.4 - i * 0.5 }));
    expect(swingContext(bars)[79].trend).toBe("down");
    expect(swingContext(bars)[30].trend).toBe("flat"); // not enough days yet
  });
});

describe("news and earnings", () => {
  const cpi = { at: "2026-10-21T12:30:00Z", country: "US", event: "CPI (YoY)", importance: "high" as const };
  const fed = { at: "2026-10-21T18:00:00Z", country: "US", event: "Fed Interest Rate Decision", importance: "high" as const };
  it("no new trades 30 min before to 60 min after big US news; Fed day afternoons", () => {
    expect(newsBlock(Date.UTC(2026, 9, 21, 13, 0), [cpi])).toMatch(/CPI/); // 9:00 ET, 30 min after 8:30
    expect(newsBlock(Date.UTC(2026, 9, 21, 13, 45), [cpi])).toBeNull(); // 9:45 ET
    expect(newsBlock(Date.UTC(2026, 9, 21, 17, 40), [fed])).toMatch(/Fed/); // 1:40 pm
    expect(newsBlock(Date.UTC(2026, 9, 21, 15, 0), [fed])).toBeNull(); // 11 am
    expect(newsBlock(Date.UTC(2026, 9, 21, 13, 0), [{ ...cpi, country: "EU" }])).toBeNull();
  });
  it("earnings: same day blocked in the reaction session; swing blocked across the report", () => {
    const amc = [{ symbol: "NVDA", date: "2026-10-21", time: "amc" as const }];
    expect(earningsBlockSameDay("NVDA", Date.UTC(2026, 9, 21, 15), amc)).toBeNull(); // report after this close
    expect(earningsBlockSameDay("NVDA", Date.UTC(2026, 9, 22, 15), amc)).toMatch(/NVDA just reported/);
    expect(earningsBlockSameDay("AAPL", Date.UTC(2026, 9, 22, 15), amc)).toBeNull();
    expect(earningsBlockSwing("NVDA", Date.UTC(2026, 9, 19, 20), Date.UTC(2026, 9, 26, 20), amc)).toMatch(/inside this trade/);
    expect(earningsBlockSwing("NVDA", Date.UTC(2026, 9, 22, 20), Date.UTC(2026, 9, 29, 20), amc)).toBeNull();
  });
});

describe("partial-profit plan", () => {
  const spec = MODES.sameday;
  const mk = (k: number, h: number, l: number, c: number): Bar => ({ time: OPEN + k * M5, open: 100, high: h, low: l, close: c });
  it("half at 60% then target = +0.8R; half then back to entry = +0.3R; stopped first = -1R", () => {
    const flat = (k: number) => mk(k, 100.1, 99.9, 100);
    const a = [mk(0, 100, 100, 100), mk(1, 100.7, 99.9, 100.6), mk(2, 101.1, 100.4, 101), flat(3), flat(4), flat(5), flat(6)];
    expect(moveOutcome(a, 0, "up", 1, spec)!.planR).toBeCloseTo(0.8);
    const b = [mk(0, 100, 100, 100), mk(1, 100.7, 99.9, 100.6), mk(2, 100.5, 99.95, 100), flat(3), flat(4), flat(5), flat(6)];
    const rb = moveOutcome(b, 0, "up", 1, spec)!;
    expect(rb.o).toBe("expired");
    expect(rb.planR).toBeCloseTo(0.3); // a win with the plan, not without
    const c = [mk(0, 100, 100, 100), mk(1, 100.2, 98.9, 99), flat(2), flat(3), flat(4), flat(5), flat(6)];
    expect(moveOutcome(c, 0, "up", 1, spec)!.planR).toBe(-1);
  });
});

describe("contract picker upgrades", () => {
  const now = Date.UTC(2026, 9, 23, 15);
  const r = (strike: number, exp: string, delta: number, bid: number, ask: number, extra: Partial<ChainRow> = {}): ChainRow => ({ type: "CALL", strike, expiration: exp, delta, bid, ask, gamma: 0.05, theta: -0.3, impliedVolatility: 30, openInterest: 1000, ...extra });
  it("same day: delta ~0.65, skipping a wide or thin contract", () => {
    const chain = [r(578, "2026-10-23", 0.66, 2.0, 2.6), r(579, "2026-10-23", 0.6, 1.5, 1.58), r(580, "2026-10-23", 0.5, 1.0, 1.05), r(577, "2026-10-23", 0.7, 2.4, 2.5, { openInterest: 3, volume: 1 })];
    const p = pickContract(chain, { symbol: "SPY", dir: "up", mode: "sameday", spot: 580, target: 581, stop: 579, now })!;
    expect(p.strike).toBe(579); // 578 has a 26% gap, 577 barely trades
    expect(p.notes).toEqual([]);
  });
  it("swing: expires before earnings; pricey options -> debit spread", () => {
    const chain = [r(580, "2026-11-20", 0.55, 9, 9.3, { impliedVolatility: 45 }), r(590, "2026-11-20", 0.3, 4, 4.2), r(580, "2026-11-06", 0.55, 6, 6.2, { impliedVolatility: 45 }), r(588, "2026-11-06", 0.32, 2.5, 2.6)];
    const p = pickContract(chain, { symbol: "NVDA", dir: "up", mode: "swing", spot: 580, target: 588, stop: 572, now, earnings: "2026-11-12", realized: 0.3 })!;
    expect(p.expiration).toBe("2026-11-06");
    expect(p.ivVsMove).toBeCloseTo(1.5);
    expect(p.notes.join(" ")).toMatch(/pricey/);
    expect(p.debitSpread).toMatchObject({ shortStrike: 588, width: 8, cost: 370, breakEven: 583.7 });
    expect(p.debitSpread!.cost).toBeLessThan(p.cost);
  });
  it("realized volatility", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 * (1 + (i % 2 ? 0.01 : -0.01)));
    expect(realizedVol(closes)!).toBeGreaterThan(0.2);
    expect(realizedVol([1, 2])).toBeNull();
  });
});
