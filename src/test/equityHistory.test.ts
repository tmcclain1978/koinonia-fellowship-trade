import { describe, it, expect } from "vitest";
import { accountRef, equityReturns, netFlows } from "../../supabase/functions/_shared/equity-snapshot";

const row = (d: string, equity: number, net_flows = 0, series_key = "s", unpriced_positions = 0) => ({ as_of_date: d, equity, net_flows, series_key, unpriced_positions });

describe("account value history", () => {
  it("deposits and withdrawals are not gains or losses", () => {
    const r = equityReturns([
      row("2026-10-19", 10_000),
      row("2026-10-20", 11_100, 1_000), // +1,000 deposit, +100 gain
      row("2026-10-21", 10_545, -500), // -500 withdrawal, -55 loss
    ]);
    expect(r.dates).toEqual(["2026-10-20", "2026-10-21"]);
    expect(r.returns[0]).toBeCloseTo(0.01);
    expect(r.returns[1]).toBeCloseTo((10_545 + 500) / 11_100 - 1);
  });

  it("out-of-order rows are sorted; a reset starts over; zero value is skipped", () => {
    const r = equityReturns([
      row("2026-10-21", 100_000, 0, "reset:1"),
      row("2026-10-19", 50_000, 0, "reset:0"),
      row("2026-10-20", 40_000, 0, "reset:0", 2),
      row("2026-10-22", 101_000, 0, "reset:1"),
    ]);
    expect(r.dates).toEqual(["2026-10-20", "2026-10-22"]);
    expect(r.returns[0]).toBeCloseTo(-0.2);
    expect(r.returns[1]).toBeCloseTo(0.01);
    expect(r.breaks).toBe(1);
    expect(r.unpricedDays).toBe(1);
    expect(equityReturns([row("a", 0), row("b", 5)]).returns).toEqual([]);
  });

  it("Schwab money movements only, and account numbers shortened", () => {
    expect(netFlows([{ type: "ACH_RECEIPT", netAmount: 500 }, { type: "TRADE", netAmount: -9_999 }, { type: "DIVIDEND_OR_INTEREST", netAmount: 12 }, { type: "WIRE_OUT", netAmount: -100.555 }])).toBe(399.45);
    expect(netFlows(null)).toBe(0);
    expect(accountRef("1234-5678")).toBe("5678");
  });
});
