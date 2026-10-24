import { describe, expect, it } from "vitest";
import type { Bar } from "../../supabase/functions/_shared/patterns/detect";
import { colorsByMinute, timeSignals } from "../../supabase/functions/_shared/patterns/schedule";
import { SignalScanner, dayReport, reportText, type ScanSignal } from "@/lib/pocketoption/scanner";

const MIN = 60_000;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 20); // 30+ days before the test "now"
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** `days` of 1-minute candles. `rigged` minutes of the day close green with probability 0.9. */
function days(n: number, seed: number, rigged: number[] = [], start = T0): Bar[] {
  const rnd = mulberry32(seed);
  const out: Bar[] = [];
  let p = 1.1;
  const rig = new Set(rigged);
  for (let i = 0; i < n * 1440; i++) {
    const t = start + i * MIN;
    const up = rig.has(i % 1440) ? rnd() < 0.9 : rnd() < 0.5;
    const c = p + (up ? 1 : -1) * (0.0001 + rnd() * 0.0002);
    out.push({ time: t, open: p, close: c, high: Math.max(p, c) + 0.00005, low: Math.min(p, c) - 0.00005 });
    p = c;
  }
  return out;
}

describe("time-of-day predictions", () => {
  it("finds minutes that repeat their color day after day", () => {
    const bars = days(30, 1, [320, 321, 1000]); // 05:20, 05:21, 16:40 UTC
    const by = colorsByMinute(bars);
    const next = T0 + 30 * DAY;
    const sig = timeSignals(by, next, next + DAY, 92);
    const mins = sig.map((s) => (s.start - next) / MIN);
    expect(mins).toEqual(expect.arrayContaining([320, 321, 1000]));
    for (const s of sig.filter((x) => [320, 321, 1000].includes((x.start - next) / MIN))) {
      expect(s.dir).toBe("up");
      expect(s.n).toBe(30);
      expect(s.winRate).toBeGreaterThan(0.7);
    }
  });

  it("random prices: almost no minute qualifies", () => {
    let total = 0;
    for (const seed of [2, 3, 4, 5, 6]) {
      const bars = days(30, seed);
      const next = T0 + 30 * DAY;
      total += timeSignals(colorsByMinute(bars), next, next + DAY, 92).length;
    }
    // 5 pairs x 1,440 minutes checked
    expect(total).toBeLessThanOrEqual(3);
  });

  it("needs at least 14 days", () => {
    const bars = days(10, 1, [320]);
    const next = T0 + 10 * DAY;
    expect(timeSignals(colorsByMinute(bars), next, next + DAY, 92)).toEqual([]);
  });
});

describe("signal scanner", () => {
  function setup(now: { t: number }) {
    const data: Record<string, Bar[]> = {
      AUDJPY_otc: days(30, 11, [(Math.floor((now.t - T0) / MIN) + 2) % 1440]), // rig the minute 2 ahead of "now"
      EURUSD_otc: days(30, 12),
    };
    // cut history at "now"
    for (const k of Object.keys(data)) data[k] = data[k].filter((b) => b.time < now.t - 2 * MIN);
    const store: Record<string, Map<number, Bar>> = {};
    const saved: ScanSignal[] = [];
    const results: string[] = [];
    const sc = new SignalScanner({
      ready: () => true,
      fetchLatest: async (a) => ({ candles: (days(31, a === "AUDJPY_otc" ? 11 : 12, a === "AUDJPY_otc" ? [(Math.floor((now.t - T0) / MIN) + 2) % 1440] : [])).filter((b) => b.time <= Math.floor(now.t / MIN) * MIN).slice(-150) }),
      loadHistory: async (a) => {
        for (const b of data[a]) (store[a] ??= new Map()).set(b.time, b);
        return { loaded: data[a].length };
      },
      store: {
        load: async () => {},
        bars: (a) => Array.from((store[a] ?? new Map()).values()).sort((x, y) => x.time - y.time),
        add: (a, bars) => { for (const b of bars) (store[a] ??= new Map()).set(b.time, b); return bars.length; },
      },
      payout: () => 92,
      name: (a) => a.replace("_otc", " OTC").replace(/^(...)(...)/, "$1/$2"),
      save: async (s) => { saved.push(s); },
      saveResult: async (s, r) => { results.push(`${s.asset}:${r.correct}`); },
      now: () => now.t,
      setTimeout: () => 0,
      clearTimeout: () => {},
    });
    return { sc, saved, results };
  }

  it("announces time-of-day calls ahead (pair, time, direction), then marks WIN/LOSS", async () => {
    const now = { t: T0 + 30 * DAY + 10 * 3600_000 + 30_000 }; // 10:00:30 on day 31
    const { sc, saved, results } = setup(now);
    await sc.start(["AUDJPY_otc", "EURUSD_otc"], { tf: 1, expiry: 1, historyDays: 30 });
    expect(sc.getSnapshot().pairs.AUDJPY_otc.days).toBeGreaterThanOrEqual(29);
    const made = await sc.scan();
    const rigged = Math.floor(now.t / MIN) * MIN + 2 * MIN;
    const call = made.find((s) => s.asset === "AUDJPY_otc" && s.start === rigged && s.source === "time");
    expect(call).toBeTruthy();
    expect(call!.call).toBe("up");
    expect(call!.name).toBe("AUD/JPY OTC");
    expect(call!.reason).toMatch(/closed green on \d+ of the last \d+ days/);
    expect(saved.some((s) => s.key === call!.key)).toBe(true);
    // Random pair: (almost) nothing announced
    expect(made.filter((s) => s.asset === "EURUSD_otc").length).toBeLessThanOrEqual(1);
    // Later: the candle closes and the scanner marks it
    now.t = rigged + 2 * MIN + 1500;
    await sc.scan();
    const done = sc.getSnapshot().signals.find((s) => s.key === call!.key)!;
    expect(done.result).not.toBeNull();
    expect(results.some((r) => r.startsWith("AUDJPY_otc:"))).toBe(true);
    sc.stop();
    expect(sc.getSnapshot().running).toBe(false);
  });

  it("day report in the channel format, every call listed", () => {
    const at = (h: number, m: number) => new Date(2026, 9, 23, h, m).getTime();
    const mk = (h: number, m: number, name: string, call: "up" | "down", res: boolean | null, flat = false): ScanSignal => ({
      key: `${name}${h}${m}`, name, asset: name, source: "time", tf: 1, expiry: 1, start: at(h, m), end: at(h, m) + MIN, entry: 0, pUp: 0.8, call, lean: call, confidence: 0.8, breakEven: 0.52, strength: "strong", evidence: [], reason: "",
      result: res === null ? null : { actual: flat ? "flat" : res === (call === "up") ? "up" : "down", exit: 0, correct: res },
    });
    const r = dayReport([mk(5, 20, "AUD/JPY OTC", "up", true), mk(6, 0, "USD/CHF OTC", "down", true), mk(19, 20, "AUD/CAD OTC", "up", false), mk(20, 0, "EUR/USD OTC", "up", null), mk(4, 0, "X", "up", true, true), { ...mk(7, 0, "Y", "up", true), start: at(7, 0) - DAY }], new Date(2026, 9, 23, 21));
    expect(r.date).toBe("23/10");
    expect(r.lines.map((l) => `${l.name} ${l.time} ${l.dir} ${l.result}`)).toEqual(["X 04:00 CALL DRAW", "AUD/JPY OTC 05:20 CALL WIN", "USD/CHF OTC 06:00 PUT WIN", "AUD/CAD OTC 19:20 CALL LOSS", "EUR/USD OTC 20:00 CALL OPEN"]);
    expect(r).toMatchObject({ wins: 2, losses: 1, draws: 1, open: 1 });
    const text = reportText(r);
    expect(text).toContain("OPERATIONS REPORT (23/10)");
    expect(text).toContain("AUD/JPY OTC - 05:20 - CALL -> WIN ✅");
    expect(text).toContain("AUD/CAD OTC - 19:20 - CALL -> LOSS ❌");
    expect(text).toContain("02 WINS ✅");
    expect(text).toContain("01 LOSS ❌");
    expect(text).toContain("Win rate: 67%");
  });
});
