import { describe, expect, it } from "vitest";
import type { Bar } from "../../supabase/functions/_shared/patterns/detect";
import { MODES, addTradingDays, moveBoard, moveOutcome, predictMove, resolveMove } from "../../supabase/functions/_shared/patterns/moves";

const M5 = 5 * 60_000;
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Trading sessions of 78 five-minute candles (9:30-16:00 ET = 13:30-20:00 UTC). `edge`: after 5 reds, a strong bounce 75% of the time. */
function sessions(days: number, seed: number, edge: boolean, start = Date.UTC(2026, 0, 5)): Bar[] {
  const rnd = mulberry32(seed);
  const out: Bar[] = [];
  let p = 100;
  let reds = 0;
  let day = start;
  for (let d = 0; d < days; d++) {
    while ([0, 6].includes(new Date(day).getUTCDay())) day += 86_400_000;
    const open = day + 13.5 * 3600_000;
    for (let k = 0; k < 78; k++) {
      let move = (rnd() - 0.5) * 0.4;
      if (edge && reds >= 5) move = rnd() < 0.75 ? 0.25 + rnd() * 0.2 : -(0.1 + rnd() * 0.2);
      const c = p + move;
      out.push({ time: open + k * M5, open: p, close: c, high: Math.max(p, c) + rnd() * 0.08, low: Math.min(p, c) - rnd() * 0.08 });
      reds = c < p ? reds + 1 : 0;
      p = c;
    }
    day += 86_400_000;
  }
  return out;
}

describe("options: move-based pattern stats", () => {
  const spec = MODES.sameday;

  it("outcome: target before stop, cautious when both in one candle, no crossing the close", () => {
    const t = Date.UTC(2026, 0, 5, 14);
    const mk = (k: number, o: number, h: number, l: number, c: number): Bar => ({ time: t + k * M5, open: o, high: h, low: l, close: c });
    const bars = [mk(0, 100, 100, 100, 100), mk(1, 100, 100.5, 99.8, 100.4), mk(2, 100.4, 101.2, 100.3, 101), mk(3, 101, 101, 101, 101), mk(4, 101, 101, 101, 101), mk(5, 101, 101, 101, 101), mk(6, 101, 101, 101, 101)];
    expect(moveOutcome(bars, 0, "up", 1, spec)!.o).toBe("win");
    expect(moveOutcome(bars, 0, "down", 1, spec)!.o).toBe("loss");
    const both = [...bars];
    both[1] = mk(1, 100, 101.5, 98.5, 100);
    expect(moveOutcome(both, 0, "up", 1, spec)!.o).toBe("loss");
    const flat = bars.map((b, k) => (k ? mk(k, 100, 100.2, 99.9, 100) : b));
    expect(moveOutcome(flat, 0, "up", 1, spec)!.o).toBe("expired");
    const gap = [...bars];
    gap[6] = { ...gap[6], time: gap[6].time + 17 * 3600_000 };
    expect(moveOutcome(gap, 0, "up", 1, spec)).toBeNull();
  });

  it("finds a real same-day edge, pooled across symbols", () => {
    const board = moveBoard([{ symbol: "SPY", bars: sessions(120, 1, true) }, { symbol: "QQQ", bars: sessions(120, 2, true) }], spec);
    const s = board.stats.find((x) => x.pattern === "red_streak" && x.dir === "up")!;
    expect(s.n).toBeGreaterThan(100);
    expect(s.verdict).toBe("edge");
    expect(s.winRate).toBeGreaterThan(s.baseline + 0.1);
    expect(s.perSymbol.SPY.n + s.perSymbol.QQQ.n).toBe(s.n);
  });

  it("random prices: almost nothing has an edge", () => {
    let edges = 0;
    let rows = 0;
    for (const seed of [3, 4, 5]) {
      const b = moveBoard([{ symbol: "A", bars: sessions(150, seed, false) }, { symbol: "B", bars: sessions(150, seed + 10, false) }], spec);
      edges += b.stats.filter((x) => x.verdict === "edge").length;
      rows += b.stats.filter((x) => x.verdict !== "too_few").length;
    }
    expect(rows).toBeGreaterThan(40);
    expect(edges).toBeLessThanOrEqual(2);
  });

  it("predicts with target, stop, deadline and reasons; resolves", () => {
    const hist = sessions(120, 1, true);
    const board = moveBoard([{ symbol: "SPY", bars: hist }], spec);
    // newest candles: 5 reds in a row in a fresh session
    const t0 = hist[hist.length - 1].time + 18 * 3600_000;
    let p = 100;
    const tail: Bar[] = [];
    for (let k = 0; k < 40; k++) {
      const c = k >= 35 ? p - 0.15 : p + (k % 2 ? -0.1 : 0.1);
      tail.push({ time: t0 + k * M5, open: p, close: c, high: Math.max(p, c) + 0.03, low: Math.min(p, c) - 0.03 });
      p = c;
    }
    const bars = [...hist, ...tail];
    const last = bars[bars.length - 1];
    const pred = predictMove("SPY", bars, board, last.time + M5)!;
    expect(pred).toMatchObject({ symbol: "SPY", dir: "up", mode: "sameday", entry: last.close });
    expect(pred.target).toBeGreaterThan(pred.entry);
    expect(pred.stop).toBeLessThan(pred.entry);
    expect(pred.until).toBe(last.time + M5 + 30 * 60_000);
    expect(pred.chance).toBeGreaterThan(pred.baseline);
    expect(pred.reason).toMatch(/Long red run/);
    const after: Bar[] = [{ time: last.time + M5, open: last.close, high: pred.target + 0.01, low: last.close - 0.01, close: pred.target }];
    expect(resolveMove(pred, after, last.time + 2 * M5)).toMatchObject({ o: "win" });
    expect(resolveMove(pred, [], last.time + 2 * M5)).toBeNull();
  });

  it("swing: trading days skip weekends", () => {
    const fri = Date.UTC(2026, 9, 23);
    expect(new Date(addTradingDays(fri, 5)).getUTCDay()).toBe(5);
    expect(addTradingDays(fri, 1) - fri).toBe(3 * 86_400_000);
  });
});

import { pickContract, type ChainRow } from "@/lib/options/contractPicker";

describe("options: contract picker", () => {
  const now = Date.UTC(2026, 9, 23, 15); // Fri Oct 23, 11:00 ET
  const row = (type: string, strike: number, expiration: string, delta: number, bid: number, ask: number): ChainRow => ({ type, strike, expiration, delta, bid, ask, gamma: 0.05, theta: -0.4, occSymbol: `X${strike}` });
  const chain: ChainRow[] = [
    row("CALL", 580, "2026-10-23", 0.52, 1.0, 1.1), row("CALL", 582, "2026-10-23", 0.35, 0.5, 0.55), row("PUT", 578, "2026-10-23", -0.48, 0.9, 1.0),
    row("CALL", 580, "2026-11-13", 0.51, 7.0, 7.2), row("CALL", 580, "2026-10-30", 0.5, 4.0, 4.1), row("CALL", 590, "2026-11-13", 0.3, 3.0, 3.1),
    row("PUT", 580, "2026-11-13", -0.49, 6.5, 6.7),
  ];
  it("same day: nearest expiration, delta ~0.5, cost and break-even", () => {
    const p = pickContract(chain, { symbol: "SPY", dir: "up", mode: "sameday", spot: 580.2, target: 581.2, stop: 579.2, now })!;
    expect(p).toMatchObject({ side: "CALL", strike: 580, expiration: "2026-10-23", dte: 0, cost: 110, breakEven: 581.1, label: "SPY Oct 23 580 Call" });
    expect(p.profitAtTarget).toBeGreaterThan(0);
    expect(p.lossAtStop).toBeLessThan(0);
  });
  it("swing: 14-45 days out, closest to 21; puts for down", () => {
    const c = pickContract(chain, { symbol: "SPY", dir: "up", mode: "swing", spot: 580, target: 586, stop: 574, now })!;
    expect(c.expiration).toBe("2026-11-13");
    expect(c.strike).toBe(580);
    const p = pickContract(chain, { symbol: "SPY", dir: "down", mode: "swing", spot: 580, target: 574, stop: 586, now })!;
    expect(p).toMatchObject({ side: "PUT", strike: 580, breakEven: 573.3 });
    expect(p.profitAtTarget).toBeGreaterThan(0);
  });
  it("no usable quotes: null", () => {
    expect(pickContract([{ ...chain[0], bid: 0 }], { symbol: "SPY", dir: "up", mode: "sameday", spot: 580, target: 581, stop: 579, now })).toBeNull();
  });
});
