import { describe, expect, it } from "vitest";
import { type Bar, aggregate, detectAt, scan, seriesFor, PATTERNS, WARMUP } from "../../supabase/functions/_shared/patterns/detect";
import { breakEven, outcomeOf, scoreboard, statFor, verdictFor, winRateFloor } from "../../supabase/functions/_shared/patterns/stats";
import { CandleStore, gaps, type CandleRow } from "@/lib/pocketoption/candleStore";
import { resolveSignals, signalsOnLast, trackRecord, worthAlert } from "@/lib/pocketoption/signals";
import { HistoryPager, HISTORY_PAGE_SEC, historyFrame, interpretEvent, parseAssets, type AuthInfo } from "../../supabase/functions/_shared/pocketoption-protocol";

const T0 = Date.UTC(2026, 9, 20, 0, 0);
const MIN = 60_000;

/** Candles from [open, high, low, close] tuples, one minute apart. */
const bars = (rows: Array<[number, number, number, number]>, start = T0): Bar[] => rows.map(([o, h, l, c], i) => ({ time: start + i * MIN, open: o, high: h, low: l, close: c }));

/** Quiet sideways candles (range ~0.1) to warm indicators up. */
function flat(n: number, at = 10): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const o = at + (i % 2 ? 0.02 : -0.02);
    const c = at + (i % 2 ? -0.02 : 0.02);
    out.push([o, Math.max(o, c) + 0.04, Math.min(o, c) - 0.04, c]);
  }
  return out;
}
/** Steady steps down (or up) from `at`. */
function move(n: number, at: number, step: number): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  let p = at;
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = p + step;
    out.push([o, Math.max(o, c) + 0.02, Math.min(o, c) - 0.02, c]);
    p = c;
  }
  return out;
}
const lastClose = (rows: Array<[number, number, number, number]>) => rows[rows.length - 1][3];

function detectLast(rows: Array<[number, number, number, number]>) {
  const b = bars(rows);
  return detectAt(b, b.length - 1, seriesFor(b)).map((d) => `${d.pattern}:${d.dir}`);
}

describe("candle patterns", () => {
  const warm = flat(WARMUP);
  const down = [...warm, ...move(7, 10, -0.08)];
  const up = [...warm, ...move(7, 10, 0.08)];
  const lo = lastClose(down);
  const hi = lastClose(up);

  it("hammer after a drop; hanging man after a rise", () => {
    expect(detectLast([...down, [lo, lo + 0.01, lo - 0.25, lo + 0.03]])).toContain("hammer:up");
    expect(detectLast([...up, [hi, hi + 0.01, hi - 0.25, hi + 0.03]])).toContain("hanging_man:down");
    // Same shape with no move before it: nothing
    const w = lastClose(warm);
    expect(detectLast([...warm, [w, w + 0.01, w - 0.25, w + 0.03]]).filter((x) => x.startsWith("hammer"))).toEqual([]);
  });

  it("shooting star after a rise", () => {
    expect(detectLast([...up, [hi, hi + 0.25, hi - 0.01, hi - 0.03]])).toContain("shooting_star:down");
  });

  it("bullish engulfing after a drop, bearish after a rise", () => {
    const d = [...down, [lo, lo + 0.01, lo - 0.08, lo - 0.06] as [number, number, number, number]];
    const l2 = lo - 0.06;
    expect(detectLast([...d, [l2 - 0.01, l2 + 0.12, l2 - 0.02, l2 + 0.1]])).toContain("bullish_engulfing:up");
    const u = [...up, [hi, hi + 0.08, hi - 0.01, hi + 0.06] as [number, number, number, number]];
    const h2 = hi + 0.06;
    expect(detectLast([...u, [h2 + 0.01, h2 + 0.02, h2 - 0.12, h2 - 0.1]])).toContain("bearish_engulfing:down");
  });

  it("three soldiers / three crows", () => {
    const w = lastClose(warm);
    expect(detectLast([...warm, [w, w + 0.11, w - 0.005, w + 0.1], [w + 0.05, w + 0.21, w + 0.045, w + 0.2], [w + 0.15, w + 0.31, w + 0.145, w + 0.3]])).toContain("three_white_soldiers:up");
    expect(detectLast([...warm, [w, w + 0.005, w - 0.11, w - 0.1], [w - 0.05, w - 0.045, w - 0.21, w - 0.2], [w - 0.15, w - 0.145, w - 0.31, w - 0.3]])).toContain("three_black_crows:down");
  });

  it("a run of 5 red candles is reported once, at the 5th", () => {
    const rows = [...warm, ...move(6, 10, -0.03)];
    const b = bars(rows);
    const s = seriesFor(b);
    const hits = b.map((_, i) => detectAt(b, i, s).filter((d) => d.pattern === "red_streak").length);
    expect(hits.reduce((a, x) => a + x, 0)).toBe(1);
    expect(hits[WARMUP + 4]).toBe(1);
  });

  it("confluence when 2+ different patterns agree", () => {
    const got = detectLast([...down, [lo, lo + 0.01, lo - 0.25, lo + 0.03]]);
    const ups = got.filter((x) => x.endsWith(":up") && !x.startsWith("confluence"));
    if (ups.length >= 2) expect(got).toContain("confluence:up");
    else expect(got).not.toContain("confluence:up");
  });

  it("nothing during warm-up; every pattern has a plain description", () => {
    const b = bars(flat(WARMUP));
    expect(scan(b, 0)).toEqual([]);
    for (const p of Object.values(PATTERNS)) expect(p.plain.length).toBeGreaterThan(20);
  });
});

describe("pattern statistics", () => {
  it("outcome: win / loss / tie, and gaps are skipped", () => {
    const b = bars([[1, 1, 1, 1], [1, 1, 1, 1.1], [1, 1, 1, 0.9], [1, 1, 1, 1]]);
    expect(outcomeOf(b, 0, "up", 1)).toBe("win");
    expect(outcomeOf(b, 0, "down", 2)).toBe("win");
    expect(outcomeOf(b, 0, "up", 3)).toBe("tie");
    expect(outcomeOf(b, 2, "up", 2)).toBeNull(); // past the end
    const gap = [...b.slice(0, 2), { ...b[2], time: b[2].time + MIN }];
    expect(outcomeOf(gap, 1, "up", 1)).toBeNull();
  });

  it("break-even and the cautious floor", () => {
    expect(breakEven(92)).toBeCloseTo(0.5208, 3);
    expect(breakEven(80)).toBeCloseTo(0.5556, 3);
    expect(winRateFloor(60, 100)).toBeLessThan(0.6);
    expect(winRateFloor(60, 100)).toBeGreaterThan(0.46);
    expect(winRateFloor(600, 1000)).toBeGreaterThan(0.56);
    expect(winRateFloor(6, 10)).toBeLessThan(0.4);
  });

  it("verdicts", () => {
    const be = breakEven(92);
    expect(verdictFor(9, 12, be, { n: 4, winRate: 1 })).toBe("too_few");
    expect(verdictFor(300, 500, be, { n: 150, winRate: 0.6 })).toBe("edge");
    expect(verdictFor(300, 500, be, { n: 5, winRate: 0.6 })).toBe("maybe"); // recent stretch too small to confirm
    expect(verdictFor(28, 50, be, { n: 15, winRate: 0.6 })).toBe("maybe");
    expect(verdictFor(300, 500, be, { n: 150, winRate: 0.45 })).toBe("fading");
    expect(verdictFor(240, 500, be, { n: 150, winRate: 0.5 })).toBe("none");
  });

  it("finds a real edge: after 5 reds the next candle is green 80% of the time", () => {
    const rows: Array<[number, number, number, number]> = [...flat(WARMUP)];
    let p = 10;
    for (let k = 0; k < 120; k++) {
      for (let j = 0; j < 5; j++) {
        rows.push([p, p + 0.01, p - 0.06, p - 0.05]);
        p -= 0.05;
      }
      const bounce = k % 5 !== 0; // 4 out of 5
      const c = bounce ? p + 0.2 : p - 0.05;
      rows.push([p, Math.max(p, c) + 0.01, Math.min(p, c) - 0.01, c]);
      p = c;
      rows.push([p, p + 0.03, p - 0.03, p + 0.01], [p + 0.01, p + 0.04, p - 0.02, p + 0.02]);
      p += 0.02;
    }
    const board = scoreboard(bars(rows), { expiries: [1], payout: 92 });
    const s = statFor(board, { pattern: "red_streak", dir: "up" }, 1)!;
    expect(s.n).toBe(120);
    expect(s.winRate).toBeCloseTo(0.8, 2);
    expect(s.verdict).toBe("edge");
    expect(s.expectancy).toBeCloseTo(0.8 * 0.92 - 0.2, 2);
    expect(board.baseline[1].n).toBeGreaterThan(500);
  });

  it("random candles: nothing gets a confident edge often", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rows: Array<[number, number, number, number]> = [];
    let p = 10;
    for (let i = 0; i < 6000; i++) {
      const c = p + (rnd() - 0.5) * 0.2;
      rows.push([p, Math.max(p, c) + rnd() * 0.05, Math.min(p, c) - rnd() * 0.05, c]);
      p = c;
    }
    const board = scoreboard(bars(rows), { expiries: [1, 3], payout: 92 });
    const edges = board.stats.filter((s) => s.verdict === "edge");
    expect(board.stats.length).toBeGreaterThan(20);
    expect(edges.length).toBeLessThanOrEqual(2);
  });

  it("5-minute candles from 1-minute ones; incomplete groups dropped", () => {
    const one = bars(flat(12), T0); // 12 minutes from :00
    const five = aggregate(one, 5);
    expect(five).toHaveLength(2);
    expect(five[0].time).toBe(T0);
    expect(five[0].open).toBe(one[0].open);
    expect(five[0].close).toBe(one[4].close);
    expect(five[0].high).toBe(Math.max(...one.slice(0, 5).map((b) => b.high)));
    const holey = [...one.slice(0, 3), ...one.slice(4)];
    expect(aggregate(holey, 5)).toHaveLength(1);
  });
});

describe("PocketOption history and assets", () => {
  it("parses the asset list (payout, OTC, open)", () => {
    const a = parseAssets([
      [66, "EURUSD_otc", "EUR/USD OTC", "currency", 5, 92, 60, 30, 3, 1, 0, 1, [], 1792800000, true, [], 0, 3, -1],
      [5, "#AAPL", "Apple", "stock", 2, 50, 60, 30, 3, 0, 170, 0, [], 1792800000, false, [], -1, 60, 1793032500],
      "junk",
    ]);
    expect(a).toEqual([
      { asset: "EURUSD_otc", name: "EUR/USD OTC", kind: "currency", payout: 92, otc: true, active: true },
      { asset: "#AAPL", name: "Apple", kind: "stock", payout: 50, otc: false, active: false },
    ]);
    const auth: AuthInfo = { message: "", isDemo: 1, uid: "1" };
    expect(interpretEvent("updateAssets", [[66, "EURUSD_otc", "EUR/USD OTC", "currency", 5, 92, 0, 0, 0, 1, 0, 0, [], 0, true]], auth)[0].type).toBe("po_assets");
  });

  it("history replies keep their request tag, even when empty", () => {
    const auth: AuthInfo = { message: "", isDemo: 1, uid: "1" };
    const [e] = interpretEvent("loadHistoryPeriodFast", { asset: "EURUSD_otc", index: 179279093516, data: [{ symbol_id: 66, time: 1792775940, open: 1.1, close: 1.2, high: 1.25, low: 1.05, volume: 101 }] }, auth);
    expect(e).toMatchObject({ type: "po_candles", asset: "EURUSD_otc", index: 179279093516, candles: [{ time: 1792775940000, open: 1.1, close: 1.2, high: 1.25, low: 1.05, volume: 101 }] });
    const [empty] = interpretEvent("loadHistoryPeriodFast", { asset: "EURUSD_otc", index: 5, data: [] }, auth);
    expect(empty).toMatchObject({ type: "po_candles", index: 5, candles: [] });
  });

  it("the pager walks back page by page without gaps, then stops", () => {
    const now = 1_792_800_000;
    const pager = new HistoryPager("EURUSD_otc", now, now - 3 * HISTORY_PAGE_SEC - 600);
    const frames: string[] = [];
    const got: number[] = [];
    while (!pager.done) {
      const f = pager.next();
      frames.push(f);
      const { time, index, offset } = JSON.parse(f.slice(2))[1];
      expect(index).toBe(pager.index);
      expect(offset).toBe(HISTORY_PAGE_SEC);
      // PocketOption returns the 150 minutes before `time`
      const page = Array.from({ length: 150 }, (_, k) => ({ time: (time - HISTORY_PAGE_SEC + k * 60) * 1000, open: 1, high: 1, low: 1, close: 1 }));
      got.push(...pager.take(page).map((c) => c.time));
    }
    expect(frames).toHaveLength(4);
    expect(new Set(got).size).toBe(got.length); // no repeats
    const sorted = [...got].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBe(60_000); // no gaps
    expect(sorted[0] / 1000).toBeGreaterThanOrEqual(now - 3 * HISTORY_PAGE_SEC - 600);
    expect(historyFrame("X", 100, 7)).toBe('42["loadHistoryPeriod",{"asset":"X","index":7,"time":100,"offset":9000,"period":60}]');
  });

  it("the pager gives up after 3 empty pages (no more history)", () => {
    const pager = new HistoryPager("EURUSD_otc", 1_792_800_000, 0);
    let n = 0;
    while (!pager.done && n < 10) {
      pager.next();
      pager.take([]);
      n++;
    }
    expect(n).toBe(3);
  });
});


describe("candle store", () => {
  const mk = (min: number, close = 1): Bar => ({ time: T0 + min * MIN, open: 1, high: 1.2, low: 0.9, close });
  function db(existing: Array<{ timestamp: string; open: number; high: number; low: number; close: number }> = []) {
    const saved: CandleRow[] = [];
    let fail = false;
    return {
      saved,
      setFail: (v: boolean) => (fail = v),
      api: {
        userId: async () => "u1",
        page: async (_u: string, _a: string, from: number, to: number) => existing.slice(from, to + 1),
        save: async (rows: CandleRow[]) => {
          if (fail) throw new Error("offline");
          saved.push(...rows);
        },
      },
    };
  }

  it("loads saved candles, skipping old flat tick rows", async () => {
    const rows = [
      { timestamp: new Date(T0 + 2 * MIN).toISOString(), open: 1, high: 1.1, low: 0.9, close: 1.05 },
      { timestamp: new Date(T0 + MIN + 1234).toISOString(), open: 1, high: 1, low: 1, close: 1 }, // tick
      { timestamp: new Date(T0 + MIN).toISOString(), open: 1, high: 1.1, low: 0.9, close: 0.95 },
    ];
    const d = db(rows);
    const s = new CandleStore(d.api, 0);
    await s.load("EURUSD_otc");
    expect(s.get("EURUSD_otc").bars.map((b) => b.time)).toEqual([T0 + MIN, T0 + 2 * MIN]);
    expect(s.get("EURUSD_otc").loaded).toBe(true);
  });

  it("saves each new candle once; live-price candles wait for PocketOption's version", async () => {
    const d = db();
    const s = new CandleStore(d.api, 0);
    expect(s.add("A", [mk(0), mk(1)])).toBe(2);
    expect(s.add("A", [mk(1)])).toBe(0); // already have it
    s.add("A", [mk(2, 1.11)], { save: false }); // built from ticks
    await s.flush();
    expect(d.saved.map((r) => r.timestamp)).toEqual([new Date(T0).toISOString(), new Date(T0 + MIN).toISOString()]);
    expect(s.get("A").bars).toHaveLength(3);
    s.add("A", [mk(2, 1.15)]); // PocketOption's own candle replaces it and is saved
    s.add("A", [mk(1, 9)], { save: false }); // ticks never replace a real candle
    await s.flush();
    expect(d.saved).toHaveLength(3);
    expect(d.saved[2]).toMatchObject({ pair: "A", close: 1.15, direction: "up", timeframe: "1m" });
    expect(s.get("A").bars.find((b) => b.time === T0 + MIN)!.close).toBe(1);
  });

  it("failed saves are kept and retried", async () => {
    const d = db();
    const s = new CandleStore(d.api, 10_000);
    d.setFail(true);
    s.add("A", [mk(0)]);
    await s.flush();
    expect(s.get("A").unsaved).toBe(1);
    expect(s.get("A").lastError).toBe("offline");
    d.setFail(false);
    await s.flush();
    expect(d.saved).toHaveLength(1);
    expect(s.get("A").unsaved).toBe(0);
  });

  it("finds gaps", () => {
    expect(gaps([mk(0), mk(1), mk(5), mk(6)], 2)).toEqual([{ from: T0 + 2 * MIN, to: T0 + 4 * MIN, minutes: 3 }]);
  });
});

describe("live signals", () => {
  it("records patterns on the newest candle with their history, then the result", () => {
    const warm = flat(WARMUP);
    const down = [...warm, ...move(7, 10, -0.08)];
    const lo = lastClose(down);
    const rows: Array<[number, number, number, number]> = [...down, [lo, lo + 0.01, lo - 0.25, lo + 0.03]];
    const b = bars(rows);
    const sig = signalsOnLast("EURUSD_otc", 1, b, null, 1);
    const hammer = sig.find((s) => s.pattern === "hammer")!;
    expect(hammer).toMatchObject({ dir: "up", candleTime: b[b.length - 1].time, entry: lo + 0.03, outcome: null, stat: null });
    expect(worthAlert(hammer, false)).toBe(false);
    // Next candle closes higher: a win
    const next = [...b, { time: b[b.length - 1].time + MIN, open: lo + 0.03, high: lo + 0.1, low: lo, close: lo + 0.08 }];
    const [done] = resolveSignals([hammer], next);
    expect(done).toMatchObject({ outcome: "win", exit: lo + 0.08 });
    const rec = trackRecord([done, { ...done, key: "x", outcome: "loss" }, { ...done, key: "y", outcome: null }]);
    expect(rec).toMatchObject({ n: 2, wins: 1, losses: 1, winRate: 0.5 });
  });
});
