import { describe, it, expect } from "vitest";
import { FUTURES_ROOTS, buildCurve, curveShape, upcomingContracts } from "@/lib/futures/futuresCurve";

const root = (r: string) => FUTURES_ROOTS.find((x) => x.root === r)!;

describe("futures contract months", () => {
  it("quarterly index futures: Dec, Mar, Jun… with Schwab symbols", () => {
    const c = upcomingContracts(root("ES"), new Date("2026-10-21T12:00:00Z"), 4);
    expect(c.map((x) => x.symbol)).toEqual(["/ESZ26", "/ESH27", "/ESM27", "/ESU27"]);
    expect(c[0].label).toBe("Dec 26");
  });
  it("crude every month; gold even months; includes the current month", () => {
    expect(upcomingContracts(root("CL"), new Date("2026-12-05T12:00:00Z"), 3).map((x) => x.symbol)).toEqual(["/CLZ26", "/CLF27", "/CLG27"]);
    expect(upcomingContracts(root("GC"), new Date("2026-10-21T12:00:00Z"), 3).map((x) => x.symbol)).toEqual(["/GCV26", "/GCZ26", "/GCG27"]);
  });
});

describe("forward curve", () => {
  const contracts = upcomingContracts(root("CL"), new Date("2026-10-21T12:00:00Z"), 4);
  const exp = (d: string) => Date.parse(d);
  it("uses only real Schwab quotes, in contract order", () => {
    const curve = buildCurve(contracts, [
      { symbol: "/CLX26", lastPrice: 74, openInterest: 300_000, futureExpirationDate: exp("2026-11-20") },
      { symbol: "/CLV26", lastPrice: 75, futureExpirationDate: exp("2020-10-20") }, // expired: dropped
      { symbol: "/CLZ26", lastPrice: 73.5, futureExpirationDate: exp("2026-12-18") },
      { symbol: "/CLF27", lastPrice: 70, source: "fmp-fallback" }, // not Schwab: dropped
    ]);
    expect(curve.map((p) => [p.symbol, p.price])).toEqual([["/CLX26", 74], ["/CLZ26", 73.5]]);
    expect(curve[0].openInterest).toBe(300_000);
  });
  it("contango / backwardation and the yearly roll", () => {
    const back = curveShape([
      { symbol: "a", label: "a", price: 74, expiration: exp("2026-11-20") },
      { symbol: "b", label: "b", price: 73.5, expiration: exp("2026-12-18") },
      { symbol: "c", label: "c", price: 72, expiration: exp("2027-01-20") },
    ])!;
    expect(back.shape).toBe("backwardation");
    expect(back.spreadPct).toBeCloseTo(((72 - 74) / 74) * 100);
    expect(back.rollYieldPct!).toBeLessThan(0);
    expect(curveShape([{ symbol: "a", label: "a", price: 100 }, { symbol: "b", label: "b", price: 101 }])!.shape).toBe("contango");
    expect(curveShape([{ symbol: "a", label: "a", price: 100 }])).toBeNull();
  });
});
