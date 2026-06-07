import { describe, it, expect } from "vitest";
import {
  shouldFill, nextTrailingStop, refPrice,
  type WorkingOrder, type QuoteLite,
} from "../../supabase/functions/_shared/paper-orders";

const q = (o: Partial<QuoteLite>): QuoteLite => ({ bid: null, ask: null, last: null, mark: null, ...o });

describe("refPrice", () => {
  it("prefers last, then mark, then mid", () => {
    expect(refPrice(q({ last: 10, mark: 11 }))).toBe(10);
    expect(refPrice(q({ mark: 11 }))).toBe(11);
    expect(refPrice(q({ bid: 10, ask: 12 }))).toBe(11);
    expect(refPrice(q({}))).toBeNull();
  });
});

describe("limit orders", () => {
  it("buy fills when the ask is at/below the limit, at the better price", () => {
    const o: WorkingOrder = { orderType: "limit", side: "buy", limitPrice: 100 };
    expect(shouldFill(o, q({ ask: 99, last: 99 }))).toMatchObject({ fill: true, fillPrice: 99 });
    expect(shouldFill(o, q({ ask: 100, last: 100 }))).toMatchObject({ fill: true, fillPrice: 100 });
    expect(shouldFill(o, q({ ask: 101, last: 101 })).fill).toBe(false);
  });
  it("sell fills when the bid is at/above the limit", () => {
    const o: WorkingOrder = { orderType: "limit", side: "sell", limitPrice: 100 };
    expect(shouldFill(o, q({ bid: 101, last: 101 }))).toMatchObject({ fill: true, fillPrice: 101 });
    expect(shouldFill(o, q({ bid: 99, last: 99 })).fill).toBe(false);
  });
});

describe("stop orders", () => {
  it("buy stop triggers at/above the stop and fills at the ask", () => {
    const o: WorkingOrder = { orderType: "stop", side: "buy", stopPrice: 50 };
    expect(shouldFill(o, q({ last: 50, ask: 50.2 }))).toMatchObject({ fill: true, fillPrice: 50.2 });
    expect(shouldFill(o, q({ last: 49, ask: 49.2 })).fill).toBe(false);
  });
  it("sell stop (stop-loss) triggers at/below the stop and fills at the bid", () => {
    const o: WorkingOrder = { orderType: "stop", side: "sell", stopPrice: 50 };
    expect(shouldFill(o, q({ last: 50, bid: 49.8 }))).toMatchObject({ fill: true, fillPrice: 49.8 });
    expect(shouldFill(o, q({ last: 51, bid: 50.8 })).fill).toBe(false);
  });
});

describe("stop-limit orders", () => {
  it("does not act until the stop triggers", () => {
    const o: WorkingOrder = { orderType: "stop_limit", side: "buy", stopPrice: 50, limitPrice: 50.5 };
    expect(shouldFill(o, q({ last: 49, ask: 49 })).fill).toBe(false);
  });
  it("once triggered, fills only if the limit is satisfied", () => {
    const o: WorkingOrder = { orderType: "stop_limit", side: "buy", stopPrice: 50, limitPrice: 50.5 };
    // stop hit but ask above limit -> triggered, not filled
    const r1 = shouldFill(o, q({ last: 50, ask: 51 }));
    expect(r1.fill).toBe(false); expect(r1.stopTriggered).toBe(true);
    // ask within limit -> fills
    const r2 = shouldFill(o, q({ last: 50, ask: 50.3 }));
    expect(r2.fill).toBe(true); expect(r2.fillPrice).toBe(50.3);
  });
  it("stays converted once triggered (stopTriggered carried in)", () => {
    const o: WorkingOrder = { orderType: "stop_limit", side: "buy", stopPrice: 50, limitPrice: 50.5, stopTriggered: true };
    // price now below stop again, but already triggered -> behaves as limit
    expect(shouldFill(o, q({ last: 48, ask: 50.4 })).fill).toBe(true);
  });
});

describe("trailing stop ratchet", () => {
  it("sell trail tracks the high and only moves the stop up", () => {
    const o: WorkingOrder = { orderType: "trailing_stop", side: "sell", trailAmount: 5 };
    let s = nextTrailingStop(o, q({ last: 100 }))!; // stop 95, hi 100
    expect(s).toEqual({ watermark: 100, stopPrice: 95 });
    s = nextTrailingStop({ ...o, ...s }, q({ last: 110 }))!; // hi 110 -> stop 105
    expect(s).toEqual({ watermark: 110, stopPrice: 105 });
    s = nextTrailingStop({ ...o, ...s }, q({ last: 108 }))!; // price dips, stop holds at 105
    expect(s.stopPrice).toBe(105);
  });
  it("sell trail fills when price falls to the stop", () => {
    const o: WorkingOrder = { orderType: "trailing_stop", side: "sell", stopPrice: 105 };
    expect(shouldFill(o, q({ last: 105, bid: 104.9 })).fill).toBe(true);
    expect(shouldFill(o, q({ last: 106, bid: 105.9 })).fill).toBe(false);
  });
  it("buy trail (protecting a short) tracks the low and only moves the stop down", () => {
    const o: WorkingOrder = { orderType: "trailing_stop", side: "buy", trailPercent: 5 };
    let s = nextTrailingStop(o, q({ last: 100 }))!; // low 100 -> stop 105
    expect(s.watermark).toBe(100); expect(s.stopPrice).toBeCloseTo(105);
    s = nextTrailingStop({ ...o, ...s }, q({ last: 90 }))!; // low 90 -> stop 94.5
    expect(s.watermark).toBe(90); expect(s.stopPrice).toBeCloseTo(94.5);
    s = nextTrailingStop({ ...o, ...s }, q({ last: 92 }))!; // rises, stop holds
    expect(s.stopPrice).toBeCloseTo(94.5);
  });
});
