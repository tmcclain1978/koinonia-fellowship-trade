import { describe, it, expect } from "vitest";
import {
  resolveFillPrice, applyFill, unrealizedPnl, cashDelta,
  buyingPower, validateOrder, equityAtCost, liveEquity, type Position,
} from "../../supabase/functions/_shared/paper-account";

const P = (qty: number, avgCost: number, mult = 1): Position => ({ qty, avgCost, mult });

describe("resolveFillPrice", () => {
  it("buys the ask, sells the bid", () => {
    expect(resolveFillPrice("buy", { bid: 99, ask: 101 })).toBe(101);
    expect(resolveFillPrice("sell", { bid: 99, ask: 101 })).toBe(99);
  });
  it("falls back to mark then last", () => {
    expect(resolveFillPrice("buy", { mark: 100 })).toBe(100);
    expect(resolveFillPrice("sell", { last: 100 })).toBe(100);
  });
  it("returns null when no usable price", () => {
    expect(resolveFillPrice("buy", {})).toBeNull();
    expect(resolveFillPrice("buy", { ask: 0 })).toBeNull();
  });
  it("applies slippage against the trader", () => {
    expect(resolveFillPrice("buy", { ask: 100 }, 50)).toBeCloseTo(100.5); // +0.5%
    expect(resolveFillPrice("sell", { bid: 100 }, 50)).toBeCloseTo(99.5);
  });
});

describe("applyFill — average cost & realized P&L", () => {
  it("opens a long", () => {
    expect(applyFill(P(0, 0), +10, 50, 1)).toEqual({ qty: 10, avgCost: 50, realized: 0 });
  });
  it("increases a long with weighted average", () => {
    const r = applyFill(P(10, 50), +10, 60, 1); // 10@50 + 10@60 -> avg 55
    expect(r.qty).toBe(20); expect(r.avgCost).toBe(55); expect(r.realized).toBe(0);
  });
  it("partial close realizes P&L and keeps the average", () => {
    const r = applyFill(P(10, 50), -4, 70, 1); // sell 4 @70, basis 50 -> +80
    expect(r.qty).toBe(6); expect(r.avgCost).toBe(50); expect(r.realized).toBe(80);
  });
  it("full close zeroes the average", () => {
    const r = applyFill(P(10, 50), -10, 55, 1);
    expect(r.qty).toBe(0); expect(r.avgCost).toBe(0); expect(r.realized).toBe(50);
  });
  it("opens and covers a short correctly", () => {
    const open = applyFill(P(0, 0), -10, 100, 1); // short 10 @100
    expect(open.qty).toBe(-10); expect(open.avgCost).toBe(100);
    const cover = applyFill(P(-10, 100), +10, 90, 1); // cover @90 -> +100 profit
    expect(cover.qty).toBe(0); expect(cover.realized).toBe(100);
  });
  it("flips long to short, realizing the long and reopening", () => {
    const r = applyFill(P(5, 50), -8, 60, 1); // close 5 (+50), open 3 short @60
    expect(r.qty).toBe(-3); expect(r.avgCost).toBe(60); expect(r.realized).toBe(50);
  });
  it("honors the options multiplier in realized P&L", () => {
    const r = applyFill(P(2, 1.5, 100), -2, 2.0, 100); // (2.0-1.5)*2*100 = 100
    expect(r.realized).toBe(100);
  });
});

describe("unrealizedPnl", () => {
  it("long gains when price rises", () => {
    expect(unrealizedPnl(P(10, 50), 55)).toBe(50);
  });
  it("short gains when price falls", () => {
    expect(unrealizedPnl(P(-10, 100), 90)).toBe(100);
  });
});

describe("cashDelta", () => {
  it("buy debits, sell credits, commission applies", () => {
    expect(cashDelta("buy", 10, 50, 1, 1)).toBe(-501);
    expect(cashDelta("sell", 10, 50, 1, 1)).toBe(499);
  });
});

describe("buying power (simplified Reg T, 2x)", () => {
  it("fresh $100k cash account has $200k buying power", () => {
    expect(buyingPower(100000, [])).toBe(200000);
  });
  it("a maxed 2:1 long leaves ~0 buying power", () => {
    // bought $200k notional with $100k -> cash -100k, position 2000@100
    expect(buyingPower(-100000, [P(2000, 100)])).toBeCloseTo(0, 4);
  });
});

describe("validateOrder", () => {
  it("allows an order within buying power", () => {
    expect(validateOrder(100000, null, "buy", 1000, 100, 1).ok).toBe(true); // $100k notional, BP $200k
  });
  it("rejects an order beyond buying power", () => {
    expect(validateOrder(100000, null, "buy", 2001, 100, 1).ok).toBe(false); // $200.1k > $200k
  });
  it("allows the exact 2:1 limit", () => {
    expect(validateOrder(100000, null, "buy", 2000, 100, 1).ok).toBe(true); // exactly $200k
  });
  it("never blocks closing/reducing a position", () => {
    expect(validateOrder(0, P(10, 50), "sell", 10, 40, 1).ok).toBe(true); // no cash, but closing
  });
  it("allows shorting within buying power and blocks beyond it", () => {
    expect(validateOrder(100000, null, "sell", 1000, 100, 1).ok).toBe(true); // short $100k
    expect(validateOrder(100000, null, "sell", 2001, 100, 1).ok).toBe(false); // short $200.1k
  });
});

describe("validateOrder — flips (regression: no realized double-count)", () => {
  it("validates a long->short flip on the resulting exposure", () => {
    // hold long 1000@100 with cash 0 (bought 1000@100 using 100k). Price 120.
    // sell 1500 @120: close 1000 (+20k realized), open short 500@120.
    const r = validateOrder(0, P(1000, 100), "sell", 1500, 120, 1, []);
    expect(r.ok).toBe(true);
  });
});

describe("liveEquity", () => {
  it("values positions at live marks", () => {
    expect(liveEquity(0, [{ qty: 10, mark: 60, mult: 1 }])).toBe(600); // 10*60
    expect(liveEquity(1000, [{ qty: -5, mark: 20, mult: 1 }])).toBe(900); // short MV -100
  });
});
