import { describe, it, expect } from "vitest";
import { bsGreeks } from "../../supabase/functions/_shared/greeks";
import {
  parseChain, expectedMove, gammaLevels, maxPain, unusualActivity, putCallRatios, expirationTime, type RawOptionContract,
} from "@/components/charts/options/optionsLevels";

// "Now" is Monday 2026-10-19 10:00 ET; the chain expires Friday 2026-10-23 at 4 pm ET.
const NOW = Date.parse("2026-10-19T10:00:00-04:00");
const EXP = "2026-10-23";
const T = (expirationTime(EXP) - NOW) / (365 * 86_400_000);

function chain(spot: number, iv: number, oi: (type: "CALL" | "PUT", k: number) => number, vol = () => 100): RawOptionContract[] {
  const out: RawOptionContract[] = [];
  for (let k = 180; k <= 220; k += 5) {
    for (const type of ["CALL", "PUT"] as const) {
      const g = bsGreeks(spot, k, T, 0.04, iv, type === "CALL" ? "call" : "put");
      out.push({ type, strike: k, expiration: EXP, bid: g.price - 0.05, ask: g.price + 0.05, volume: vol(), openInterest: oi(type, k), impliedVolatility: iv * 100, gamma: g.gamma });
    }
  }
  return out;
}

describe("parseChain", () => {
  it("converts Schwab's percent IV, drops expired and bad rows, and uses the 4 pm ET close", () => {
    const c = parseChain([
      { type: "CALL", strike: 200, expiration: EXP, impliedVolatility: 28.5, openInterest: 10, gamma: 0.05, bid: 1, ask: 1.2 },
      { type: "PUT", strike: 200, expiration: "2026-10-16", impliedVolatility: 30 }, // expired
      { type: "CALL", strike: 205, expiration: EXP, impliedVolatility: -999, gamma: -999 }, // Schwab "not available"
      { type: "FOO", strike: 1, expiration: EXP },
    ], NOW);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ type: "call", iv: 0.285, gamma: 0.05, mid: 1.1, oi: 10 });
    expect(c[0].t).toBeCloseTo(T, 10);
    expect(c[1].iv).toBeNull();
    expect(c[1].gamma).toBeNull();
  });
});

describe("expected move", () => {
  it("is spot × IV × √time, around the at-the-money strike", () => {
    const em = expectedMove(parseChain(chain(200, 0.3, () => 100), NOW), 200, EXP)!;
    expect(em.iv).toBeCloseTo(0.3, 6);
    expect(em.move).toBeCloseTo(200 * 0.3 * Math.sqrt(T), 6);
    expect(em.upper).toBeCloseTo(200 + em.move, 6);
    expect(em.atmStrike).toBe(200);
    // The straddle is a market-priced cross-check: ≈ 0.8 × the 1σ move.
    expect(em.straddle! / em.move).toBeGreaterThan(0.7);
    expect(em.straddle! / em.move).toBeLessThan(0.9);
  });

  it("interpolates IV between strikes when spot is between them", () => {
    const raw = chain(202.5, 0.3, () => 100).map((r) => ({ ...r, impliedVolatility: r.strike === 200 ? 20 : r.strike === 205 ? 40 : 30 }));
    expect(expectedMove(parseChain(raw, NOW), 202.5, EXP)!.iv).toBeCloseTo(0.3, 6);
  });
});

describe("gamma exposure", () => {
  it("counts calls as positive and puts as negative, in $ per 1% move", () => {
    const raw = chain(200, 0.3, (type, k) => (k === 200 && type === "CALL" ? 1000 : 0));
    const g = gammaLevels(parseChain(raw, NOW), 200)!;
    const row = g.byStrike.find((r) => r.strike === 200)!;
    const gamma = raw.find((r) => r.strike === 200 && r.type === "CALL")!.gamma!;
    expect(row.call).toBeCloseTo(gamma * 1000 * 100 * 200 * 200 * 0.01, 6);
    expect(row.put).toBe(0);
    expect(g.total).toBeGreaterThan(0);
  });

  it("finds the call wall, put wall, and a gamma flip between them", () => {
    const oi = (type: "CALL" | "PUT", k: number) => (type === "CALL" && k === 210 ? 20_000 : type === "PUT" && k === 190 ? 20_000 : 100);
    const g = gammaLevels(parseChain(chain(200, 0.3, oi), NOW), 200)!;
    expect(g.callWall).toBe(210);
    expect(g.putWall).toBe(190);
    expect(g.flip).not.toBeNull();
    expect(g.flip!).toBeGreaterThan(190);
    expect(g.flip!).toBeLessThan(210);
    // Below the flip total gamma is negative, above it positive.
    expect(Math.abs(g.flip! - 200)).toBeLessThan(3);
  });

  it("reports no flip when gamma has the same sign everywhere nearby", () => {
    const g = gammaLevels(parseChain(chain(200, 0.3, (type) => (type === "CALL" ? 1000 : 0)), NOW), 200)!;
    expect(g.flip).toBeNull();
  });
});

describe("max pain", () => {
  it("is the strike where holders' total payout is smallest", () => {
    // Calls pile up at 210, puts at 190: payout is lowest between them.
    const raw: RawOptionContract[] = [
      { type: "CALL", strike: 190, expiration: EXP, openInterest: 100 },
      { type: "CALL", strike: 200, expiration: EXP, openInterest: 500 },
      { type: "CALL", strike: 210, expiration: EXP, openInterest: 5000 },
      { type: "PUT", strike: 190, expiration: EXP, openInterest: 5000 },
      { type: "PUT", strike: 200, expiration: EXP, openInterest: 500 },
      { type: "PUT", strike: 210, expiration: EXP, openInterest: 100 },
    ];
    // At 200: calls pay 100×10 = 1,000; puts pay 100×10 = 1,000 → 2,000 (the minimum).
    expect(maxPain(parseChain(raw, NOW), EXP)).toBe(200);
  });
});

describe("unusual activity", () => {
  it("keeps contracts whose volume is at least their open interest, biggest first", () => {
    const raw = chain(200, 0.3, () => 1000, () => 50).map((r) => {
      if (r.strike === 210 && r.type === "CALL") return { ...r, volume: 5000, openInterest: 800 };
      if (r.strike === 190 && r.type === "PUT") return { ...r, volume: 1200, openInterest: 1000 };
      if (r.strike === 200 && r.type === "CALL") return { ...r, volume: 9000, openInterest: 50_000 }; // busy but not new
      return r;
    });
    const u = unusualActivity(parseChain(raw, NOW));
    expect(u.map((x) => `${x.strike}${x.type[0]}`)).toEqual(["210c", "190p"]);
    expect(u[0].ratio).toBeCloseTo(6.25);
    expect(u[0].premium).toBeGreaterThan(0);
  });

  it("put/call ratios", () => {
    const r = putCallRatios(parseChain(chain(200, 0.3, (t) => (t === "PUT" ? 200 : 100), () => 10), NOW));
    expect(r.openInterest).toBeCloseTo(2);
    expect(r.volume).toBeCloseTo(1);
  });
});
