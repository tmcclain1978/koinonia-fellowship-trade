import { describe, expect, it } from "vitest";
import type { Bar } from "../../supabase/functions/_shared/patterns/detect";
import { failedFilters, passes, roundStep, sameDayContext, swingContext, NO_FILTERS } from "../../supabase/functions/_shared/patterns/context";
import { MODES, moveOutcome, resolveMove } from "../../supabase/functions/_shared/patterns/moves";
import { chainView } from "@/lib/options/chainSignals";
import { DEFAULT_LIMITS, OptionsScanner, pausedPatterns, type OptionSignal } from "@/lib/options/scanner";
import type { ChainRow } from "@/lib/options/contractPicker";

const M5 = 5 * 60_000;
const DAY1 = Date.UTC(2026, 9, 20, 13, 30); // Tue 9:30 ET
const DAY2 = Date.UTC(2026, 9, 21, 13, 30); // Wed 9:30 ET

/** A session of `n` candles from `open`, flat around `p` with range 0.2, volume `v`. */
function session(open: number, n: number, p: number, v = 1000, drift = 0): Bar[] {
  return Array.from({ length: n }, (_, k) => {
    const o = p + drift * k;
    return { time: open + k * M5, open: o, close: o + drift, high: o + Math.max(drift, 0) + 0.1, low: o + Math.min(drift, 0) - 0.1, volume: v };
  });
}

describe("key levels and room to the target", () => {
  it("yesterday's high is in the way of a 1-ATR call target; plenty of room for a put", () => {
    const y = session(DAY1, 78, 100); // yesterday: high ~100.1
    y[40] = { ...y[40], high: 101.0 }; // yesterday's high at 101.00
    const t = session(DAY2, 3, 100.8); // today's first 15 minutes, just under it
    const ctx = sameDayContext([...y, ...t]);
    const c = ctx[ctx.length - 1];
    expect(c.levelAbove?.name).toBe("yesterday's high");
    expect(c.levelAbove?.price).toBe(101);
    expect(c.roomUp).toBe(false);
    expect(passes("up", c, null, { ...NO_FILTERS, room: true })).toBe(false);
    expect(failedFilters("up", c, null, { ...NO_FILTERS, room: true })[0]).toMatch(/yesterday's high \(\$101.00\) is in the way/);
    expect(passes("up", c, null, NO_FILTERS)).toBe(true);
  });

  it("opening range counts after the first 15 minutes; round numbers by price", () => {
    const t = session(DAY2, 8, 200);
    t[1] = { ...t[1], high: 200.6 };
    const ctx = sameDayContext(t);
    expect(ctx[2].levelAbove?.name).not.toBe("opening-range high"); // still inside the first 15 minutes
    expect(ctx[5].levelAbove?.name).toBe("opening-range high");
    expect(roundStep(580)).toBe(5);
    expect(roundStep(45)).toBe(1);
    expect(roundStep(580, true)).toBe(10);
  });

  it("relative volume by time of day, and the volume filter", () => {
    const days = [0, 1, 2, 3].map((d) => session(DAY1 - (3 - d) * 86_400_000 + (d === 3 ? 0 : 0), 6, 100, 1000));
    // make the 4 sessions consecutive weekdays: Thu, Fri, Mon, Tue
    const opens = [Date.UTC(2026, 9, 15, 13, 30), Date.UTC(2026, 9, 16, 13, 30), Date.UTC(2026, 9, 19, 13, 30), DAY1];
    const bars = opens.flatMap((o, d) => session(o, 6, 100, d === 3 ? 3000 : 1000));
    void days;
    const ctx = sameDayContext(bars);
    expect(ctx[ctx.length - 1].rvol).toBeCloseTo(3);
    expect(ctx[2].rvol).toBeNull(); // no history yet
    expect(passes("up", { ...ctx[ctx.length - 1], rvol: 0.8 }, null, { ...NO_FILTERS, volume: true })).toBe(false);
    expect(passes("up", ctx[ctx.length - 1], null, { ...NO_FILTERS, volume: true })).toBe(true);
  });

  it("swing: 20-day high is a level", () => {
    const bars: Bar[] = Array.from({ length: 70 }, (_, i) => ({ time: i * 86_400_000, open: 100, close: 100, high: i === 50 ? 103 : 101, low: 99, volume: 1e6 }));
    const c = swingContext(bars)[69];
    expect(c.levelAbove).toEqual({ price: 103, name: "20-day high" });
    expect(c.roomUp).toBe(true); // 103 is more than 1 ATR (2.0) above 100
  });
});

describe("time stop", () => {
  const spec = MODES.sameday;
  const mk = (k: number, h: number, l: number, c: number): Bar => ({ time: DAY2 + k * M5, open: 100, high: h, low: l, close: c });
  it("out after 15 minutes when it hasn't moved 0.3 ATR our way", () => {
    const bars = [mk(0, 100, 100, 100), mk(1, 100.1, 99.9, 100), mk(2, 100.2, 99.9, 99.95), mk(3, 100.1, 99.8, 99.9), mk(4, 100.9, 99.9, 100.9), mk(5, 101.2, 100.8, 101.1), mk(6, 101, 101, 101)];
    const r = moveOutcome(bars, 0, "up", 1, spec)!;
    expect(r.o).toBe("win"); // target hit later...
    expect(r.planR).toBeCloseTo(-0.1); // ...but the plan was already out at 99.90
    const pred = { dir: "up" as const, at: DAY2 + M5, until: DAY2 + 7 * M5, target: 101, stop: 99, mode: "sameday" as const, entry: 100, partial: 100.6 };
    expect(resolveMove(pred, bars.slice(1), DAY2 + 8 * M5)!.planR).toBeCloseTo(-0.1);
  });
  it("stays in when it moved enough", () => {
    const bars = [mk(0, 100, 100, 100), mk(1, 100.4, 99.9, 100.35), mk(2, 100.4, 100.2, 100.3), mk(3, 100.4, 100.2, 100.3), mk(4, 101.1, 100.3, 101), mk(5, 101, 101, 101), mk(6, 101, 101, 101)];
    expect(moveOutcome(bars, 0, "up", 1, spec)!.planR).toBeCloseTo(0.8);
  });
});

describe("option chain: walls and flow", () => {
  const now = Date.UTC(2026, 9, 21, 15);
  const row = (type: string, strike: number, oi: number, volume: number, mark = 1): ChainRow => ({ type, strike, expiration: "2026-10-23", bid: mark - 0.05, ask: mark + 0.05, mark, gamma: 0.05, openInterest: oi, volume, impliedVolatility: 20 });
  it("a call wall between entry and target blocks; unusual call buying is detected", () => {
    const rows = [row("CALL", 580, 500, 2000), row("CALL", 581, 90000, 100), row("CALL", 585, 1000, 50), row("PUT", 575, 30000, 100), row("PUT", 570, 100, 50)];
    const v = chainView(rows, { spot: 580, dir: "up", entry: 580, target: 581.5, atr: 1.5, now });
    expect(v.callWall).toBe(581);
    expect(v.wallInWay).toEqual({ price: 581, kind: "call wall" });
    expect(v.flow?.side).toBe("calls");
    const far = chainView(rows, { spot: 580, dir: "up", entry: 581.2, target: 582.7, atr: 1.5, now });
    expect(far.wallInWay).toBeNull(); // wall at 581 is behind the entry
  });
});

describe("self-policing and daily limits", () => {
  const sig = (i: number, outcome: "win" | "loss", pattern = "hammer"): OptionSignal => ({
    key: `k${i}`, symbol: "SPY", mode: "sameday", dir: "up", entry: 100, at: Date.UTC(2026, 9, 1 + i), until: 0, target: 101, stop: 99, atr: 1, chance: 0.6, baseline: 0.48, strength: "moderate",
    evidence: [{ pattern: pattern as never, name: "Hammer", dir: "up", winRate: 0.6, n: 100, verdict: "edge", baseline: 0.48, scope: "own" }], reason: "", contract: null, outcome, exit: null,
  });
  it("pauses a pattern that lost more than a random entry over its last 10; a fresh start clears it", () => {
    const list = Array.from({ length: 10 }, (_, i) => sig(i, i < 3 ? "win" : "loss"));
    const p = pausedPatterns(list);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ key: "sameday|hammer|up", wins: 3, n: 10 });
    expect(pausedPatterns(list, { "sameday|hammer|up": Date.UTC(2026, 9, 20) })).toHaveLength(0);
    expect(pausedPatterns(list.slice(0, 9))).toHaveLength(0); // not enough results yet
    expect(pausedPatterns(Array.from({ length: 10 }, (_, i) => sig(i, i < 6 ? "win" : "loss")))).toHaveLength(0);
  });
  it("limits default to 6 a day, stop after 3 losses", () => {
    expect(DEFAULT_LIMITS).toEqual({ maxPerDay: 6, stopAfterLosses: 3 });
    const sc = new OptionsScanner({ history: async () => [], latest: async () => [], chain: async () => null });
    sc.seed(Array.from({ length: 10 }, (_, i) => sig(i, i < 3 ? "win" : "loss")));
    expect(sc.getSnapshot().paused).toHaveLength(1);
    sc.unpause("sameday|hammer|up");
    expect(sc.getSnapshot().paused).toHaveLength(0);
    sc.setLimits({ maxPerDay: 2 });
    expect(sc.getSnapshot().limits.maxPerDay).toBe(2);
  });
});
