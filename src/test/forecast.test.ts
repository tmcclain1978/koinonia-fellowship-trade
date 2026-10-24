import { describe, expect, it } from "vitest";
import type { Bar } from "../../supabase/functions/_shared/patterns/detect";
import { scoreboard } from "../../supabase/functions/_shared/patterns/stats";
import { forecastNext, resolveForecast, sequenceEvidence } from "../../supabase/functions/_shared/patterns/forecast";

const MIN = 60_000;
function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Random candles; with `edge`, after 5 reds the next is green 78% of the time. */
function series(n: number, seed: number, edge: boolean): Bar[] {
  const rnd = mulberry32(seed);
  const out: Bar[] = [];
  let p = 1.1;
  let reds = 0;
  for (let i = 0; i < n; i++) {
    let up = rnd() < 0.5;
    if (edge && reds >= 5) up = rnd() < 0.78;
    const c = p + (up ? 1 : -1) * (0.00005 + rnd() * 0.0002);
    out.push({ time: i * MIN, open: p, close: c, high: Math.max(p, c) + rnd() * 0.0001, low: Math.min(p, c) - rnd() * 0.0001 });
    reds = c < p ? reds + 1 : 0;
    p = c;
  }
  return out;
}
/** Append candles of the given colors. */
function extend(bars: Bar[], colors: string): Bar[] {
  const out = [...bars];
  let p = out[out.length - 1].close;
  for (const c of colors) {
    const close = c === "G" ? p + 0.0002 : p - 0.0002;
    out.push({ time: out[out.length - 1].time + MIN, open: p, close, high: Math.max(p, close) + 0.00002, low: Math.min(p, close) - 0.00002 });
    p = close;
  }
  return out;
}

describe("next-candle forecast", () => {
  const hist = series(12_000, 3, true);
  const board = scoreboard(hist, { expiries: [1], payout: 92 });

  it("after 5 reds (a proven edge): calls GREEN for the next candle, with reasons and the time", () => {
    const bars = extend(hist, "GRRRRR");
    const f = forecastNext("EURUSD_otc", bars, board, { expiry: 1, payout: 92, tf: 1 })!;
    expect(f.call).toBe("up");
    expect(f.strength).toBe("strong");
    expect(f.confidence).toBeGreaterThan(f.breakEven);
    expect(f.start).toBe(bars[bars.length - 1].time + MIN);
    expect(f.end).toBe(f.start + MIN);
    expect(f.evidence.some((e) => e.label === "Long red run" && e.dir === "up" && e.verdict === "edge")).toBe(true);
    expect(f.reason).toMatch(/Long red run.*green/);
    // It came true:
    const after = extend(bars, "G");
    expect(resolveForecast(f, after)).toMatchObject({ actual: "up", correct: true });
    const wrong = extend(bars, "R");
    expect(resolveForecast(f, wrong)).toMatchObject({ actual: "down", correct: false });
    expect(resolveForecast(f, bars)).toBeNull(); // still open
  });

  it("random prices: almost never makes a call", () => {
    const rand = series(12_000, 9, false);
    const rb = scoreboard(rand, { expiries: [1], payout: 92 });
    let calls = 0;
    let tries = 0;
    for (let end = 11_000; end < 12_000; end += 7) {
      const f = forecastNext("X", rand.slice(0, end), rb, { expiry: 1, payout: 92, tf: 1 });
      tries++;
      if (f?.call) calls++;
    }
    expect(calls / tries).toBeLessThan(0.08);
  });

  it("no usable history: no call, and says why", () => {
    const f = forecastNext("X", series(80, 1, false), null, { expiry: 1, payout: 92, tf: 1 })!;
    expect(f.call).toBeNull();
    expect(f.reason).toMatch(/nothing to go on|Skip/);
    expect(forecastNext("X", [], null, { expiry: 1, payout: 92, tf: 1 })).toBeNull();
  });

  it("color sequences: counted from history, skipping overlaps and gaps", () => {
    const bars = extend(hist, "RRRRR");
    const e = sequenceEvidence(bars, 5, 1, 92)!;
    expect(e.label).toBe("Last 5 candles: red, red, red, red, red");
    expect(e.dir).toBe("up");
    expect(e.winRate).toBeGreaterThan(0.6);
    expect(e.n).toBeGreaterThan(50);
  });
});
