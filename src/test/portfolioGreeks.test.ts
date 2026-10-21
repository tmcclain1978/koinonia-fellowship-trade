import { describe, it, expect } from "vitest";
import { computePortfolioRisk, parseOsi, positionsFromSchwab, quoteSymbols, type GreekQuote } from "@/lib/risk/portfolioGreeks";
import { bsGreeks, yearsToExpiry } from "../../supabase/functions/_shared/greeks";

const RAW = [
  { longQuantity: 100, shortQuantity: 0, marketValue: 19_000, instrument: { assetType: "EQUITY", symbol: "AAPL" } },
  { longQuantity: 2, shortQuantity: 0, marketValue: 1_200, instrument: { assetType: "OPTION", symbol: "AAPL  261218C00200000", underlyingSymbol: "AAPL" } },
  { longQuantity: 0, shortQuantity: 1, marketValue: -450, instrument: { assetType: "OPTION", symbol: "SPY   261218P00500000", underlyingSymbol: "SPY" } },
  { longQuantity: 5000, shortQuantity: 0, marketValue: 5000, instrument: { assetType: "CASH_EQUIVALENT", symbol: "SWVXX" } },
  { longQuantity: 0, shortQuantity: 0, marketValue: 0, instrument: { assetType: "EQUITY", symbol: "ZERO" } },
];

const quotes = (extra: GreekQuote[] = []) => {
  const m = new Map<string, GreekQuote>();
  for (const q of [
    { symbol: "AAPL", lastPrice: 190 },
    { symbol: "SPY", lastPrice: 500 },
    { symbol: "AAPL  261218C00200000", delta: 0.4, gamma: 0.02, theta: -0.05, vega: 0.3, underlyingPrice: 190, multiplier: 100 },
    { symbol: "SPY   261218P00500000", delta: -0.45, gamma: 0.01, theta: -0.1, vega: 0.6, underlyingPrice: 500 },
    ...extra,
  ]) m.set(q.symbol, q);
  return m;
};

describe("portfolio Greeks from real positions", () => {
  it("reads Schwab positions (long minus short) and skips zero quantity", () => {
    const p = positionsFromSchwab(RAW);
    expect(p.map((x) => [x.symbol, x.quantity])).toEqual([["AAPL", 100], ["AAPL  261218C00200000", 2], ["SPY   261218P00500000", -1], ["SWVXX", 5000]]);
    expect(quoteSymbols(p).sort()).toEqual(["AAPL", "AAPL  261218C00200000", "SPY", "SPY   261218P00500000"].sort());
    expect(positionsFromSchwab(null)).toEqual([]);
  });

  it("parses option symbols", () => {
    expect(parseOsi("AAPL  261218C00200000")).toEqual({ underlying: "AAPL", expiration: "2026-12-18", type: "call", strike: 200 });
    expect(parseOsi("SPY261218P00512500")).toMatchObject({ type: "put", strike: 512.5 });
    expect(parseOsi("AAPL")).toBeNull();
  });

  it("stocks count share for share; options use Schwab's Greeks x contracts x 100", () => {
    const r = computePortfolioRisk(positionsFromSchwab(RAW), quotes(), { accountValue: 50_000 });
    const by = Object.fromEntries(r.rows.map((x) => [x.symbol, x]));
    expect(by.AAPL).toMatchObject({ shareDelta: 100, dollarDelta: 19_000, theta: 0 });
    const call = by["AAPL  261218C00200000"];
    expect(call.shareDelta).toBeCloseTo(80); // 0.4 x 2 x 100
    expect(call.theta).toBeCloseTo(-10); // -0.05 x 200
    expect(call.vega).toBeCloseTo(60);
    expect(call.dollarDelta).toBeCloseTo(80 * 190);
    expect(call.gamma1pct).toBeCloseTo(0.02 * 200 * 190 * 190 * 0.01);
    expect(call.label).toBe("AAPL 12-18 200C");
    const put = by["SPY   261218P00500000"];
    expect(put.shareDelta).toBeCloseTo(45); // short put = long delta
    expect(put.theta).toBeCloseTo(10); // short option earns time decay
    expect(r.skipped).toEqual(["SWVXX"]);
    expect(r.dollarDelta).toBeCloseTo(19_000 + 15_200 + 22_500);
    expect(r.spyShares).toBeCloseTo(r.dollarDelta / 500);
    expect(r.netExposurePct).toBeCloseTo((r.dollarDelta / 50_000) * 100);
    expect(r.longDollars).toBeCloseTo(r.dollarDelta);
    expect(r.shortDollars).toBe(0);
  });

  it("Schwab's -999 (not calculated) falls back to Black-Scholes from implied volatility", () => {
    const q = quotes([{ symbol: "AAPL  261218C00200000", delta: -999, gamma: -999, theta: -999, vega: -999, volatility: 30, underlyingPrice: 190 }]);
    const now = new Date("2026-10-21T15:00:00Z");
    const r = computePortfolioRisk(positionsFromSchwab(RAW), q, { now });
    const call = r.rows.find((x) => x.symbol.startsWith("AAPL "))!;
    const m = bsGreeks(190, 200, yearsToExpiry("2026-12-18", now), 0.04, 0.3, "call");
    expect(call.source).toBe("model");
    expect(call.shareDelta).toBeCloseTo(m.delta * 200);
  });

  it("an option with no quote is listed as missing, not guessed", () => {
    const q = quotes();
    q.delete("SPY   261218P00500000");
    const r = computePortfolioRisk(positionsFromSchwab(RAW), q);
    expect(r.rows.map((x) => x.symbol)).not.toContain("SPY   261218P00500000");
    expect(r.missing).toEqual([{ symbol: "SPY 12-18 500P", reason: "No option quote" }]);
    expect(computePortfolioRisk(positionsFromSchwab(RAW), new Map()).spyShares).toBeNull();
  });
});
