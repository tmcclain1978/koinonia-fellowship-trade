import { describe, expect, it } from "vitest";
import { MODES, type MoveRecord, type MoveRecords } from "../../supabase/functions/_shared/patterns/moves";
import { score, trainModel } from "../../supabase/functions/_shared/patterns/model";

function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Fake replayed signals. `effect`: how much a trend that agrees raises the hit rate. */
function records(n: number, seed: number, effect: number): MoveRecords {
  const rnd = mulberry32(seed);
  const recs: MoveRecord[] = [];
  const pats = ["hammer", "bullish_engulfing", "red_streak", "doji_reversal"] as const;
  for (let i = 0; i < n; i++) {
    const dir = rnd() < 0.5 ? "up" : "down";
    const trend = rnd() < 0.33 ? "up" : rnd() < 0.5 ? "down" : "flat";
    const agrees = trend === dir;
    const p = 0.45 + (agrees ? effect : 0) - (trend !== "flat" && !agrees ? effect / 2 : 0);
    const win = rnd() < p;
    recs.push({
      symbol: "SPY", pattern: pats[i % 4], dir, t: i * 300_000, o: win ? "win" : "loss", end: 0, planR: win ? 0.8 : -1,
      ctx: { trend, vwap: 100, window: (["morning", "lunch", "afternoon"] as const)[i % 3], roomUp: true, roomDown: true, rvol: 1 }, market: null, px: 100,
    });
  }
  return { spec: MODES.sameday, records: recs, bars: n * 10, symbols: ["SPY"] };
}

describe("confidence model", () => {
  it("learns a real effect and proves it on newer, unseen signals", () => {
    const out = trainModel(records(4000, 1, 0.15))!;
    expect(out.check.trainN).toBe(2800);
    expect(out.check.testN).toBe(1200);
    expect(out.check.auc).toBeGreaterThan(0.58);
    expect(out.check.topRate).toBeGreaterThan(out.check.testRate + 0.05);
    expect(out.check.useful).toBe(true);
    expect(out.check.drivers[0].name).toMatch(/Trend/);
    // A live setup with the trend scores higher than one against it.
    const withT = score(out.model, { pattern: "hammer", dir: "up", ctx: { trend: "up", vwap: 99, window: "morning", roomUp: true, rvol: 1 }, market: null, px: 100 });
    const againstT = score(out.model, { pattern: "hammer", dir: "up", ctx: { trend: "down", vwap: 99, window: "morning", roomUp: true, rvol: 1 }, market: null, px: 100 });
    expect(withT).toBeGreaterThan(againstT + 0.1);
    // Buckets: higher scores really did hit more often on unseen data.
    const filled = out.check.buckets.filter((b) => b.n >= 50);
    for (let k = 1; k < filled.length; k++) expect(filled[k].actual).toBeGreaterThan(filled[k - 1].actual - 0.03);
  });

  it("pure noise: not marked useful", () => {
    const out = trainModel(records(4000, 2, 0))!;
    expect(out.check.auc).toBeLessThan(0.56);
    expect(out.check.useful).toBe(false);
  });

  it("too few signals: no model", () => {
    expect(trainModel(records(100, 3, 0.2))).toBeNull();
  });

  it("the split is by time: test signals are all newer than training ones", () => {
    const rec = records(1000, 4, 0.1);
    rec.records.reverse(); // order in the input shouldn't matter
    const out = trainModel(rec)!;
    expect(out.check.splitAt).toBe(700 * 300_000);
  });
});
