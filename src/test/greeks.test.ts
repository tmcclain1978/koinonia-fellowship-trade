import { describe, it, expect } from "vitest";
import { bsGreeks, normCdf } from "../../supabase/functions/_shared/greeks";

describe("normCdf", () => {
  it("matches known values", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 4);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe("bsGreeks — ATM, S=K=100, T=1, r=0, sigma=0.2", () => {
  const g = bsGreeks(100, 100, 1, 0, 0.2, "call");
  it("prices the call near 7.97", () => expect(g.price).toBeCloseTo(7.9656, 3));
  it("delta near 0.54", () => expect(g.delta).toBeCloseTo(0.5398, 3));
  it("gamma near 0.0198", () => expect(g.gamma).toBeCloseTo(0.01985, 4));
  it("vega (per 1%) near 0.397", () => expect(g.vega).toBeCloseTo(0.39695, 3));
  it("theta/day near -0.0109", () => expect(g.theta).toBeCloseTo(-0.01088, 4));

  const p = bsGreeks(100, 100, 1, 0, 0.2, "put");
  it("put-call parity at r=0 gives equal price", () => expect(p.price).toBeCloseTo(g.price, 3));
  it("put delta near -0.46", () => expect(p.delta).toBeCloseTo(-0.4602, 3));
});

describe("bsGreeks — edge cases", () => {
  it("expired call = intrinsic, no sensitivities", () => {
    const g = bsGreeks(110, 100, 0, 0.01, 0.2, "call");
    expect(g.price).toBe(10); expect(g.gamma).toBe(0); expect(g.vega).toBe(0);
  });
  it("expired OTM put = 0", () => {
    expect(bsGreeks(110, 100, 0, 0.01, 0.2, "put").price).toBe(0);
  });
  it("deep ITM call delta approaches 1", () => {
    expect(bsGreeks(200, 100, 0.5, 0.04, 0.3, "call").delta).toBeGreaterThan(0.95);
  });
});
