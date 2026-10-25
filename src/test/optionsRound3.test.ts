import { describe, expect, it } from "vitest";
import type { Bar } from "../../supabase/functions/_shared/patterns/detect";
import { OptionsScanner, type OptionSignal, bestExpectedValue, expectedValue } from "@/lib/options/scanner";
import type { ChainRow } from "@/lib/options/contractPicker";
import { weekStart, weeklyReport, weeklyText } from "@/lib/options/weekly";

const M5 = 5 * 60_000;
const DAY = 86_400_000;
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sessions(days: number, seed: number, start = Date.UTC(2026, 0, 5)): Bar[] {
  const rnd = mulberry32(seed);
  const out: Bar[] = [];
  let p = 580, reds = 0, day = start;
  for (let d = 0; d < days; d++) {
    while ([0, 6].includes(new Date(day).getUTCDay())) day += DAY;
    const open = day + 13.5 * 3600_000;
    for (let k = 0; k < 78; k++) {
      let move = (rnd() - 0.5) * 0.4;
      if (reds >= 5) move = rnd() < 0.75 ? 0.25 + rnd() * 0.2 : -(0.1 + rnd() * 0.2);
      const c = p + move;
      out.push({ time: open + k * M5, open: p, close: c, high: Math.max(p, c) + rnd() * 0.08, low: Math.min(p, c) - rnd() * 0.08 });
      reds = c < p ? reds + 1 : 0;
      p = c;
    }
    day += DAY;
  }
  return out;
}
/** Calm daily closes (about 8% yearly moves) for the "pricey" check. */
const calmDaily = (end: number): Bar[] => Array.from({ length: 70 }, (_, i) => {
  const c = 580 * (1 + (i % 2 ? 0.005 : -0.005));
  return { time: end - (70 - i) * DAY, open: 580, high: c + 1, low: c - 1, close: c };
});

const day = Date.UTC(2026, 9, 21); // Wed Oct 21 2026
const open = day + 13.5 * 3600_000;
function setup(chain: { rows: ChainRow[] }) {
  const now = { t: open + 18 * M5 + 20_000 }; // 11:00:20 ET
  let p = 580;
  const today: Bar[] = [];
  for (let k = 0; k < 18; k++) {
    const c = k >= 13 ? p - 0.15 : p + (k % 2 ? -0.1 : 0.1);
    today.push({ time: open + k * M5, open: p, close: c, high: Math.max(p, c) + 0.03, low: Math.min(p, c) - 0.03 });
    p = c;
  }
  const state = { latest: today, p };
  const saved: OptionSignal[] = [];
  const extra: OptionSignal[] = [];
  const results: OptionSignal[] = [];
  const sc = new OptionsScanner({
    history: async (sym, mode) => (sym !== "SPY" ? [] : mode === "sameday" ? sessions(120, 1) : calmDaily(day)),
    latest: async (sym) => (sym === "SPY" ? state.latest : []),
    chain: async () => ({ rows: chain.rows, spot: state.p }),
    save: async (s) => { saved.push(s); },
    saveExtra: async (s) => { extra.push(s); },
    now: () => now.t,
    setTimeout: () => 0,
    clearTimeout: () => {},
  });
  sc.onResult((s) => results.push(s));
  return { sc, now, state, today, saved, extra, results };
}
const row = (o: Partial<ChainRow>): ChainRow => ({ type: "CALL", strike: 578, expiration: "2026-10-21", bid: 1.0, ask: 1.02, delta: 0.65, gamma: 0, theta: 0, ...o });
const OFF = { trend: false, market: false, lunch: false, room: false, volume: false };

describe("option price check", () => {
  it("skips pricey options and options whose math doesn't pay; allows fair ones", async () => {
    const chain = { rows: [row({ impliedVolatility: 60 })] };
    const t = setup(chain);
    await t.sc.start(["SPY", "QQQ"]);
    t.sc.setFilters(OFF);
    await t.sc.sameDayPass();
    expect(t.sc.getSnapshot().signals).toHaveLength(0);
    expect(t.sc.getSnapshot().skipped[0].reasons[0]).toMatch(/options are pricey: they price in 60% yearly moves, the stock has been moving about \d+%/);
    // Not pricey, but a huge bid/ask gap: the math doesn't pay.
    chain.rows = [row({ bid: 0.4, ask: 2.5 })];
    t.now.t += 1; // same candle, new check
    (t.sc as unknown as { s: { skipped: unknown[] } }).s.skipped = [];
    await t.sc.sameDayPass();
    expect(t.sc.getSnapshot().signals).toHaveLength(0);
    expect(t.sc.getSnapshot().skipped[0].reasons[0]).toMatch(/option math doesn't pay/);
    // Turned off: predicted anyway.
    t.sc.setFilters({ payoff: false });
    await t.sc.sameDayPass();
    expect(t.sc.getSnapshot().signals).toHaveLength(1);
    t.sc.stop();
  });

  it("fair option passes both checks", async () => {
    const t = setup({ rows: [row({ impliedVolatility: 9 })] });
    await t.sc.start(["SPY", "QQQ"]);
    t.sc.setFilters(OFF);
    await t.sc.sameDayPass();
    const s = t.sc.getSnapshot().signals[0];
    expect(s.contract).toBeTruthy();
    expect(expectedValue(s.chance, s.contract!)).toBeGreaterThan(0);
    t.sc.stop();
  });

  it("expected value helpers", () => {
    expect(expectedValue(0.6, { profitAtTarget: 50, lossAtStop: -50 })).toBeCloseTo(10);
    const c = { profitAtTarget: 10, lossAtStop: -60, debitSpread: { profitAtTarget: 40, lossAtStop: -30 } } as unknown as Parameters<typeof bestExpectedValue>[1];
    expect(bestExpectedValue(0.6, c)).toBeCloseTo(12); // the spread is better
  });
});

describe("real fill check", () => {
  it("checks the live bid/ask when a prediction ends, and tells you when it was too late to check", async () => {
    const chain = { rows: [row({})] };
    const t = setup(chain);
    await t.sc.start(["SPY", "QQQ"]);
    t.sc.setFilters({ ...OFF, payoff: false });
    await t.sc.sameDayPass();
    const sig = t.sc.getSnapshot().signals[0];
    expect(sig.contract).toMatchObject({ strike: 578, ask: 1.02, mid: 1.01 });
    // Next candle hits the target; the option is now 1.40 / 1.44.
    chain.rows = [row({ bid: 1.4, ask: 1.44 })];
    t.now.t += M5;
    t.state.latest = [...t.today, { time: open + 18 * M5, open: t.state.p, high: sig.target + 0.05, low: t.state.p - 0.02, close: sig.target }];
    await t.sc.sameDayPass();
    await new Promise((r) => setTimeout(r, 0));
    const done = t.sc.getSnapshot().signals[0];
    expect(done.outcome).toBe("win");
    expect(t.results.map((x) => x.key)).toEqual([sig.key]);
    expect(done.fill).toMatchObject({ entryAsk: 1.02, entryMid: 1.01, exitBid: 1.4, exitMid: 1.42, realPnl: 38, midPnl: 41, estPnl: sig.contract!.profitAtTarget });
    expect(t.extra.at(-1)?.fill?.realPnl).toBe(38);
    t.sc.stop();

    // Opening the app later: the result is known but the quote would be stale, so no fill check.
    const t2 = setup(chain);
    t2.sc.seed([{ ...sig, outcome: null, exit: null }]);
    t2.state.latest = t.state.latest;
    t2.now.t = open + 22 * M5 + 20_000; // 11:20: the target was hit at 11:05
    await t2.sc.start(["SPY", "QQQ"]);
    await t2.sc.sameDayPass();
    await new Promise((r) => setTimeout(r, 0));
    const late = t2.sc.getSnapshot().signals[0];
    expect(late.outcome).toBe("win");
    expect(late.fill).toBeUndefined();
    expect(t2.results).toHaveLength(1);
    t2.sc.stop();
  });

  it("no live quote: says so", async () => {
    const chain = { rows: [row({})] };
    const t = setup(chain);
    await t.sc.start(["SPY", "QQQ"]);
    t.sc.setFilters({ ...OFF, payoff: false });
    await t.sc.sameDayPass();
    const sig = t.sc.getSnapshot().signals[0];
    chain.rows = [];
    t.now.t += M5;
    t.state.latest = [...t.today, { time: open + 18 * M5, open: t.state.p, high: t.state.p + 0.02, low: sig.stop - 0.05, close: sig.stop }];
    await t.sc.sameDayPass();
    await new Promise((r) => setTimeout(r, 0));
    const done = t.sc.getSnapshot().signals[0];
    expect(done.outcome).toBe("loss");
    expect(done.fill).toMatchObject({ realPnl: null, note: "the option had no live quote when the prediction ended" });
    t.sc.stop();
  });
});

describe("auto paper trading settings", () => {
  it("is off by default, keeps 1-10 contracts, and saves trades but not 'busy'", async () => {
    const t = setup({ rows: [row({})] });
    expect(t.sc.getSnapshot().autoPaper).toEqual({ on: false, qty: 1, onlyIfPays: true });
    t.sc.setAutoPaper({ on: true, qty: 40 });
    expect(t.sc.getSnapshot().autoPaper.qty).toBe(10);
    t.sc.setAutoPaper({ qty: 0 });
    expect(t.sc.getSnapshot().autoPaper.qty).toBe(1);
    await t.sc.start(["SPY", "QQQ"]);
    t.sc.setFilters({ ...OFF, payoff: false });
    await t.sc.sameDayPass();
    const key = t.sc.getSnapshot().signals[0].key;
    t.sc.markPaper(key, { qty: 2, busy: true });
    expect(t.extra).toHaveLength(0);
    t.sc.markPaper(key, { qty: 2, buy: 1.02 });
    expect(t.extra.at(-1)?.paper).toEqual({ qty: 2, buy: 1.02 });
    t.sc.stop();
  });
});

/* ---- weekly report card ---------------------------------------------------- */
let n = 0;
function sig(o: Partial<OptionSignal> & { at: number }): OptionSignal {
  n++;
  return {
    key: `k${n}`, symbol: "SPY", mode: "sameday", dir: "up", entry: 100, until: o.at + 30 * 60_000, target: 101, stop: 99, atr: 1, chance: 0.6, baseline: 0.48, strength: "moderate",
    evidence: [{ pattern: "red_streak", name: "Long red run", dir: "up", winRate: 0.6, n: 100, verdict: "edge", baseline: 0.48, scope: "all" }],
    reason: "", contract: null, outcome: "win", exit: 101, planR: 0.5, ...o,
  } as OptionSignal;
}

describe("weekly report card", () => {
  it("weeks start Monday midnight New York time (also across the clock change)", () => {
    const wed = Date.UTC(2026, 9, 21, 15); // Wed Oct 21
    expect(new Date(weekStart(wed)).toISOString()).toBe("2026-10-19T04:00:00.000Z"); // Mon 00:00 EDT
    expect(new Date(weekStart(wed, 1)).toISOString()).toBe("2026-10-12T04:00:00.000Z");
    const afterDst = Date.UTC(2026, 10, 4, 15); // Wed Nov 4 (EST since Nov 1)
    expect(new Date(weekStart(afterDst)).toISOString()).toBe("2026-11-02T05:00:00.000Z");
    // Sunday night still belongs to the week that started Monday.
    expect(weekStart(Date.UTC(2026, 9, 26, 2))).toBe(weekStart(wed)); // Sun Oct 25 10pm ET
  });

  it("counts results, finds best and worst, compares with last week, and writes plain notes", () => {
    const mon = weekStart(Date.UTC(2026, 9, 21, 15));
    const at = (d: number, h = 15) => mon + d * DAY + h * 3600_000;
    const doji = [{ pattern: "doji_reversal", name: "Doji after a move", dir: "down", winRate: 0.55, n: 80, verdict: "maybe", baseline: 0.46, scope: "all" }] as OptionSignal["evidence"];
    const list = [
      sig({ at: at(0), outcome: "win" }),
      sig({ at: at(1), outcome: "win", symbol: "QQQ" }),
      sig({ at: at(2), outcome: "win" }),
      sig({ at: at(3), outcome: "loss", planR: -1 }),
      sig({ at: at(0), outcome: "loss", dir: "down", symbol: "TSLA", evidence: doji, planR: -1 }),
      sig({ at: at(1), outcome: "loss", dir: "down", symbol: "TSLA", evidence: doji, planR: -1 }),
      sig({ at: at(2), outcome: "expired", dir: "down", symbol: "TSLA", evidence: doji, planR: 0 }),
      sig({ at: at(4), outcome: null, exit: null }),
      // Real fill + paper trade
      sig({ at: at(4, 14), outcome: "win", fill: { entryAsk: 1, entryMid: 0.98, exitBid: 1.3, exitMid: 1.34, realPnl: 30, midPnl: 36, estPnl: 40, at: 0 }, paper: { qty: 1, buy: 1, sell: 1.3, pnl: 30 } }),
      // Last week: 1 of 4
      ...[0, 1, 2, 3].map((d) => sig({ at: at(d) - 7 * DAY, outcome: d === 0 ? "win" : "loss" })),
    ];
    const r = weeklyReport(list, mon);
    expect(r).toMatchObject({ total: 9, wins: 4, losses: 3, expired: 1, open: 1 });
    expect(r.hitRate).toBeCloseTo(0.5);
    expect(r.best?.label).toBe("Long red run calls");
    expect(r.worst?.label).toBe("Doji after a move puts");
    expect(r.bySymbol.find((x) => x.key === "TSLA")).toMatchObject({ n: 3, wins: 0 });
    expect(r.fills).toMatchObject({ n: 1, realPnl: 30, midPnl: 36 });
    expect(r.paper).toMatchObject({ n: 1, pnl: 30, wins: 1 });
    expect(r.prev).toMatchObject({ n: 4, hitRate: 0.25 });
    const notes = r.notes.join("\n");
    expect(notes).toMatch(/Hit the target first in 4 of 8 predictions \(50%\)\. A random entry would hit about 48%/);
    expect(notes).toMatch(/too few to judge/);
    expect(notes).toMatch(/1 still open/);
    expect(notes).toMatch(/Best: Long red run calls, 4 of 5/);
    expect(notes).toMatch(/Worst: Doji after a move puts, 0 of 3/);
    expect(notes).toMatch(/Calls did much better \(80% vs 0%\)/);
    expect(notes).toMatch(/Nothing worked on TSLA \(0 of 3\)/);
    expect(notes).toMatch(/Up from 25% last week/);
    expect(notes).toMatch(/bid\/ask gap cost about \$6 per trade/);
    expect(notes).toMatch(/Paper trades: 1 of 1 made money, total \+\$30/);
    expect(r.label).toBe("Oct 19 – Oct 25");
    const text = weeklyText(r);
    expect(text).toMatch(/WEEKLY REPORT CARD \(Oct 19 – Oct 25\)/);
    expect(text).toMatch(/TSLA: 0 of 3 \(0%\)/);
  });

  it("empty week", () => {
    const r = weeklyReport([], weekStart(Date.UTC(2026, 9, 21, 15)));
    expect(r.notes).toEqual(["No predictions this week."]);
    expect(r.best).toBeNull();
  });
});
