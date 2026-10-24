import { describe, expect, it } from "vitest";
import type { Bar } from "../../supabase/functions/_shared/patterns/detect";
import { OptionsScanner, optionsReport, type OptionSignal } from "@/lib/options/scanner";
import type { ChainRow } from "@/lib/options/contractPicker";

const M5 = 5 * 60_000;
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sessions(days: number, seed: number, start = Date.UTC(2026, 0, 5)): Bar[] {
  const rnd = mulberry32(seed);
  const out: Bar[] = [];
  let p = 580, reds = 0, day = start;
  for (let d = 0; d < days; d++) {
    while ([0, 6].includes(new Date(day).getUTCDay())) day += 86_400_000;
    const open = day + 13.5 * 3600_000;
    for (let k = 0; k < 78; k++) {
      let move = (rnd() - 0.5) * 0.4;
      if (reds >= 5) move = rnd() < 0.75 ? 0.25 + rnd() * 0.2 : -(0.1 + rnd() * 0.2);
      const c = p + move;
      out.push({ time: open + k * M5, open: p, close: c, high: Math.max(p, c) + rnd() * 0.08, low: Math.min(p, c) - rnd() * 0.08 });
      reds = c < p ? reds + 1 : 0;
      p = c;
    }
    day += 86_400_000;
  }
  return out;
}

describe("options scanner", () => {
  it("same day: predicts at a 5-minute close with a contract, then marks the result", async () => {
    const day = Date.UTC(2026, 9, 21); // Wed Oct 21 2026
    const open = day + 13.5 * 3600_000; // 9:30 ET (EDT)
    const now = { t: open + 18 * M5 + 20_000 }; // 11:00:20 ET
    // Today: quiet, then 5 reds ending with the candle that closed at 11:00
    let p = 580;
    const today: Bar[] = [];
    for (let k = 0; k < 18; k++) {
      const c = k >= 13 ? p - 0.15 : p + (k % 2 ? -0.1 : 0.1);
      today.push({ time: open + k * M5, open: p, close: c, high: Math.max(p, c) + 0.03, low: Math.min(p, c) - 0.03 });
      p = c;
    }
    const chain: ChainRow[] = [580, 579, 578].map((k, i) => ({ type: "CALL", strike: k, expiration: "2026-10-21", bid: 1 + i * 0.3, ask: 1.1 + i * 0.3, delta: 0.45 + i * 0.07, gamma: 0.08, theta: -1.2 }));
    const saved: OptionSignal[] = [];
    const results: OptionSignal[] = [];
    let latest = today;
    const sc = new OptionsScanner({
      history: async (sym, mode) => (mode === "sameday" ? (sym === "SPY" ? sessions(120, 1) : []) : []),
      latest: async (sym) => (sym === "SPY" ? latest : []),
      chain: async () => ({ rows: chain, spot: p }),
      save: async (s) => { saved.push(s); },
      saveResult: async (s) => { results.push(s); },
      now: () => now.t,
      setTimeout: () => 0,
      clearTimeout: () => {},
    });
    await sc.start(["SPY", "QQQ"]);
    // Trend filters on: today trends down, so the call is skipped, with the reason shown.
    sc.setFilters({ trend: true, market: true, lunch: true, room: false, volume: false });
    await sc.sameDayPass();
    expect(sc.getSnapshot().signals).toHaveLength(0);
    expect(sc.getSnapshot().skipped[0]).toMatchObject({ symbol: "SPY", dir: "up" });
    expect(sc.getSnapshot().skipped[0].reasons.join(" ")).toMatch(/bigger trend/);
    expect(sc.getSnapshot().calendars).toEqual({ news: "unavailable", earnings: "unavailable" });
    const imp = sc.getSnapshot().impact.sameday!;
    expect(imp.map((x) => x.label)).toEqual(["No filters", "Trend only", "Market only", "Skip lunch only", "Room to target only", "Volume only", "All filters"]);
    expect(imp[0].n).toBeGreaterThan(imp[6].n);
    // Filters off: the same setup is predicted.
    sc.setFilters({ trend: false, market: false, lunch: false, room: false });
    expect(sc.getSnapshot().boards.sameday?.stats.find((s) => s.pattern === "red_streak" && s.dir === "up")?.verdict).toBe("edge");
    await sc.sameDayPass();
    const sig = sc.getSnapshot().signals[0];
    expect(sig).toMatchObject({ symbol: "SPY", dir: "up", mode: "sameday", at: open + 18 * M5 });
    expect(sig.until).toBe(sig.at + 30 * 60_000);
    expect(sig.contract).toMatchObject({ side: "CALL", strike: 578, expiration: "2026-10-21" }); // delta ~0.65
    expect(saved).toHaveLength(1);
    // Next candle jumps to the target
    now.t += M5;
    latest = [...today, { time: open + 18 * M5, open: p, high: sig.target + 0.05, low: p - 0.02, close: sig.target }];
    await sc.sameDayPass();
    const done = sc.getSnapshot().signals.find((s) => s.key === sig.key)!;
    expect(done.outcome).toBe("win");
    expect(done.planR).toBeGreaterThan(0); // partial-profit plan: half at 60%, rest at target
    expect(results).toHaveLength(1);
    const r = optionsReport(sc.getSnapshot().signals, day, day + 86_400_000);
    expect(r).toMatchObject({ wins: 1, losses: 0, open: 0 });
    expect(r.lines[0]).toMatchObject({ when: "11:00", symbol: "SPY", dir: "CALL", result: "WIN", contract: "SPY Oct 21 578 Call" });
    expect(r.estPnl).toBeGreaterThan(0);
    sc.stop();
  });

  it("confidence score: trained per mode, blocks low scores, and is shown on the signal", async () => {
    const day = Date.UTC(2026, 9, 21);
    const open = day + 13.5 * 3600_000;
    const now = { t: open + 18 * M5 + 20_000 };
    let p = 580;
    const today: Bar[] = [];
    for (let k = 0; k < 18; k++) {
      const c = k >= 13 ? p - 0.15 : p + (k % 2 ? -0.1 : 0.1);
      today.push({ time: open + k * M5, open: p, close: c, high: Math.max(p, c) + 0.03, low: Math.min(p, c) - 0.03 });
      p = c;
    }
    const sc = new OptionsScanner({
      history: async (sym, mode) => (mode === "sameday" ? (sym === "SPY" ? sessions(120, 1) : []) : []),
      latest: async (sym) => (sym === "SPY" ? today : []),
      chain: async () => null,
      save: async () => {},
      saveResult: async () => {},
      now: () => now.t,
      setTimeout: () => 0,
      clearTimeout: () => {},
    });
    await sc.start(["SPY", "QQQ"]);
    sc.setFilters({ trend: false, market: false, lunch: false, room: false, volume: false });
    const check = sc.getSnapshot().model.sameday!;
    expect(check.trainN).toBeGreaterThan(check.testN);
    expect(check.splitAt).toBeGreaterThan(0);
    // Pretend the model proved itself, with a pessimistic score: the setup is skipped.
    const inner = sc as unknown as { models: Record<string, unknown>; set: (v: unknown) => void };
    const model = (bias: number) => ({ weights: new Array(12).fill(0), bias, priors: {}, baseRate: 0.5, mean: new Array(12).fill(0), scale: new Array(12).fill(1) });
    inner.models.sameday = model(-3);
    inner.set({ model: { sameday: { ...check, useful: true, testRate: 0.5 } } });
    await sc.sameDayPass();
    expect(sc.getSnapshot().signals).toHaveLength(0);
    expect(sc.getSnapshot().skipped[0].reasons.join(" ")).toMatch(/confidence score 5% is below the 55% needed/);
    // Turned off: the simple rules alone decide.
    sc.setScoring({ use: false });
    await sc.sameDayPass();
    expect(sc.getSnapshot().signals).toHaveLength(1);
    expect(sc.getSnapshot().signals[0].score).toBeUndefined();
    sc.stop();
    // A confident score passes and is kept on the signal.
    const sc2 = new OptionsScanner({
      history: async (sym, mode) => (mode === "sameday" ? (sym === "SPY" ? sessions(120, 1) : []) : []),
      latest: async (sym) => (sym === "SPY" ? today : []),
      chain: async () => null,
      save: async () => {},
      saveResult: async () => {},
      now: () => now.t,
      setTimeout: () => 0,
      clearTimeout: () => {},
    });
    await sc2.start(["SPY", "QQQ"]);
    sc2.setFilters({ trend: false, market: false, lunch: false, room: false, volume: false });
    const inner2 = sc2 as unknown as typeof inner;
    inner2.models.sameday = model(3);
    inner2.set({ model: { sameday: { ...check, useful: true, testRate: 0.5 } } });
    await sc2.sameDayPass();
    expect(sc2.getSnapshot().signals[0].score).toBeCloseTo(0.953, 2);
    sc2.stop();
  });

  it("no prediction when the 30 minutes would run past the close", async () => {
    const day = Date.UTC(2026, 9, 21);
    const open = day + 13.5 * 3600_000;
    const now = { t: open + 75 * M5 + 20_000 }; // 15:45 ET
    let p = 580;
    const today: Bar[] = [];
    for (let k = 0; k < 75; k++) {
      const c = k >= 70 ? p - 0.15 : p + (k % 2 ? -0.1 : 0.1);
      today.push({ time: open + k * M5, open: p, close: c, high: Math.max(p, c) + 0.03, low: Math.min(p, c) - 0.03 });
      p = c;
    }
    const sc = new OptionsScanner({
      history: async (sym, mode) => (mode === "sameday" && sym === "SPY" ? sessions(120, 1) : []),
      latest: async () => today,
      chain: async () => null,
      now: () => now.t,
      setTimeout: () => 0,
      clearTimeout: () => {},
    });
    await sc.start(["SPY"]);
    await sc.sameDayPass();
    expect(sc.getSnapshot().signals).toHaveLength(0);
  });
});
