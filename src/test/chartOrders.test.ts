import { describe, it, expect } from "vitest";
import {
  normalizeSchwabOrders, normalizeSchwabPositions, buildSchwabReplacement, normalizePaperOrders, normalizePaperPositions,
  paperPriceUpdate, checkPriceChange, roundToTick, positionPnl, orderLabel,
} from "@/components/charts/trading/chartOrders";

const HASH = { "12345678": "HASHABC" };
const schwab = (o: Record<string, unknown>) => ({
  orderId: 1001, accountNumber: 12345678, status: "WORKING", orderType: "LIMIT", orderStrategyType: "SINGLE",
  session: "NORMAL", duration: "GOOD_TILL_CANCEL", quantity: 100, filledQuantity: 0, remainingQuantity: 100, price: 190.25,
  orderLegCollection: [{ instruction: "BUY", quantity: 100, instrument: { symbol: "AAPL", assetType: "EQUITY" } }],
  ...o,
});

describe("Schwab orders on the chart", () => {
  it("shows a working limit order as a draggable line at its limit price", () => {
    const [o] = normalizeSchwabOrders([schwab({})], "aapl", HASH);
    expect(o).toMatchObject({ id: "1001", side: "buy", kind: "LIMIT", linePrice: 190.25, quantity: 100, draggable: true, cancelable: true, accountHash: "HASHABC" });
    expect(orderLabel(o)).toBe("BUY LMT 100 @ 190.25 …5678");
  });

  it("draws stop and stop-limit orders at the stop price", () => {
    const [stop] = normalizeSchwabOrders([schwab({ orderType: "STOP", price: undefined, stopPrice: 185 })], "AAPL", HASH);
    const [sl] = normalizeSchwabOrders([schwab({ orderType: "STOP_LIMIT", stopPrice: 185, price: 184.5 })], "AAPL", HASH);
    expect(stop.linePrice).toBe(185);
    expect(sl.linePrice).toBe(185);
    expect(sl.limitPrice).toBe(184.5);
  });

  it("ignores other symbols and finished orders", () => {
    const got = normalizeSchwabOrders(
      [schwab({ orderLegCollection: [{ instruction: "BUY", quantity: 1, instrument: { symbol: "MSFT", assetType: "EQUITY" } }] }), schwab({ status: "FILLED" }), schwab({ status: "CANCELED" })],
      "AAPL", HASH,
    );
    expect(got).toEqual([]);
  });

  it("keeps bracket / OCO legs read-only", () => {
    const bracket = schwab({
      orderStrategyType: "TRIGGER",
      status: "FILLED",
      childOrderStrategies: [
        {
          orderStrategyType: "OCO",
          childOrderStrategies: [
            schwab({ orderId: 2001, accountNumber: undefined, orderType: "LIMIT", price: 200, orderLegCollection: [{ instruction: "SELL", quantity: 100, instrument: { symbol: "AAPL", assetType: "EQUITY" } }] }),
            schwab({ orderId: 2002, accountNumber: undefined, orderType: "STOP", price: undefined, stopPrice: 180, orderLegCollection: [{ instruction: "SELL", quantity: 100, instrument: { symbol: "AAPL", assetType: "EQUITY" } }] }),
          ],
        },
      ],
    });
    const got = normalizeSchwabOrders([bracket], "AAPL", HASH);
    expect(got.map((o) => o.id).sort()).toEqual(["2001", "2002"]);
    expect(got.every((o) => !o.draggable && /bracket/i.test(o.lockedReason ?? ""))).toBe(true);
    expect(got.every((o) => !o.cancelable)).toBe(true); // no ✕ on bracket legs
    expect(got.every((o) => o.accountHash === "HASHABC")).toBe(true); // account comes from the parent
  });

  it("blocks dragging partly filled, trailing, option, multi-leg and non-editable orders", () => {
    const reasons = [
      schwab({ filledQuantity: 40, remainingQuantity: 60 }),
      schwab({ orderType: "TRAILING_STOP", stopPrice: 180 }),
      schwab({ orderLegCollection: [{ instruction: "BUY_TO_OPEN", quantity: 1, instrument: { symbol: "AAPL", assetType: "OPTION" } }] }),
      schwab({ orderLegCollection: [
        { instruction: "BUY", quantity: 1, instrument: { symbol: "AAPL", assetType: "EQUITY" } },
        { instruction: "SELL", quantity: 1, instrument: { symbol: "AAPL", assetType: "EQUITY" } },
      ] }),
      schwab({ editable: false }),
      schwab({ status: "AWAITING_PARENT_ORDER" }),
    ].map((r) => normalizeSchwabOrders([r], "AAPL", HASH)[0]);
    for (const o of reasons) {
      expect(o.draggable).toBe(false);
      expect(o.lockedReason).toBeTruthy();
    }
    expect(reasons[0].quantity).toBe(60);
  });

  it("can't change orders whose account isn't linked", () => {
    const [o] = normalizeSchwabOrders([schwab({ accountNumber: 999 })], "AAPL", HASH);
    expect(o.draggable).toBe(false);
    expect(o.cancelable).toBe(false);
  });
});

describe("Schwab replacement order", () => {
  it("carries the order over with only the price changed", () => {
    const [o] = normalizeSchwabOrders([schwab({ specialInstruction: "ALL_OR_NONE" })], "AAPL", HASH);
    expect(buildSchwabReplacement(o, 189.5)).toEqual({
      orderType: "LIMIT", session: "NORMAL", duration: "GOOD_TILL_CANCEL", orderStrategyType: "SINGLE", price: "189.50",
      specialInstruction: "ALL_OR_NONE",
      orderLegCollection: [{ instruction: "BUY", quantity: 100, instrument: { symbol: "AAPL", assetType: "EQUITY" } }],
    });
  });

  it("moves a stop-limit's limit by the same amount as the stop", () => {
    const [o] = normalizeSchwabOrders([schwab({ orderType: "STOP_LIMIT", stopPrice: 185, price: 184.5, orderLegCollection: [{ instruction: "SELL", quantity: 100, instrument: { symbol: "AAPL", assetType: "EQUITY" } }] })], "AAPL", HASH);
    const r = buildSchwabReplacement(o, 183) as unknown as Record<string, string>;
    expect(r.stopPrice).toBe("183.00");
    expect(r.price).toBe("182.50");
  });

  it("uses 4 decimals for prices under $1", () => {
    const [o] = normalizeSchwabOrders([schwab({ price: 0.5123 })], "AAPL", HASH);
    expect((buildSchwabReplacement(o, 0.51234) as unknown as Record<string, string>).price).toBe("0.5123");
  });
});

describe("paper orders and positions", () => {
  const row = (o: Record<string, unknown>) => ({ id: "p1", symbol: "AAPL", side: "sell", order_type: "stop", quantity: 10, limit_price: null, stop_price: 180, status: "working", contract_key: null, ...o });
  it("shows working stock orders and skips options", () => {
    const got = normalizePaperOrders([row({}), row({ id: "p2", contract_key: "AAPL 250117C200" }), row({ id: "p3", status: "filled" })], "AAPL");
    expect(got.map((o) => o.id)).toEqual(["p1"]);
    expect(got[0]).toMatchObject({ kind: "STOP", linePrice: 180, draggable: true, source: "paper" });
  });
  it("builds the column update for a moved order", () => {
    const [stop] = normalizePaperOrders([row({})], "AAPL");
    expect(paperPriceUpdate(stop, 178.5)).toEqual({ stop_price: 178.5 });
    const [sl] = normalizePaperOrders([row({ order_type: "stop_limit", limit_price: 179.5 })], "AAPL");
    expect(paperPriceUpdate(sl, 181)).toEqual({ stop_price: 181, limit_price: 180.5 });
  });
  it("reads paper positions", () => {
    expect(normalizePaperPositions([{ id: "x", symbol: "AAPL", quantity: -5, avg_cost: 200, contract_key: null }], "AAPL")[0]).toMatchObject({ quantity: -5, avgPrice: 200 });
  });
});

describe("Schwab positions", () => {
  it("reads long and short stock positions for the symbol", () => {
    const accounts = [{ securitiesAccount: { accountNumber: "12345678", positions: [
      { instrument: { symbol: "AAPL", assetType: "EQUITY" }, longQuantity: 100, shortQuantity: 0, averageLongPrice: 185.1 },
      { instrument: { symbol: "AAPL  250117C00200000", assetType: "OPTION" }, longQuantity: 1, shortQuantity: 0, averagePrice: 3 },
      { instrument: { symbol: "MSFT", assetType: "EQUITY" }, longQuantity: 5, shortQuantity: 0, averagePrice: 400 },
    ] } }];
    const got = normalizeSchwabPositions(accounts, "AAPL");
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ quantity: 100, avgPrice: 185.1, accountLabel: "…5678" });
  });
});

describe("price change checks", () => {
  const [buyLimit] = normalizeSchwabOrders([schwab({})], "AAPL", HASH);
  const [sellStop] = normalizeSchwabOrders([schwab({ orderType: "STOP", price: undefined, stopPrice: 185, orderLegCollection: [{ instruction: "SELL", quantity: 100, instrument: { symbol: "AAPL", assetType: "EQUITY" } }] })], "AAPL", HASH);
  const market = { last: 191, bid: 190.98, ask: 191.02 };

  it("rounds to a valid tick", () => {
    expect(roundToTick(190.256)).toBe(190.26);
    expect(roundToTick(0.51236)).toBe(0.5124);
    expect(checkPriceChange(buyLimit, 189.999, market).price).toBe(190);
  });

  it("warns when a buy limit is moved to or above the ask", () => {
    const c = checkPriceChange(buyLimit, 191.5, market);
    expect(c.blockers).toEqual([]);
    expect(c.warnings.join(" ")).toMatch(/fill right away/);
  });

  it("warns when a sell stop is moved to or above the last price", () => {
    expect(checkPriceChange(sellStop, 192, market).warnings.join(" ")).toMatch(/trigger right away/);
    expect(checkPriceChange(sellStop, 184, market).warnings).toEqual([]);
  });

  it("warns on big moves and blocks zero, unchanged and locked orders", () => {
    expect(checkPriceChange(buyLimit, 160, market).warnings.join(" ")).toMatch(/15\.\d% move/);
    expect(checkPriceChange(buyLimit, 0, market).blockers.length).toBeGreaterThan(0);
    expect(checkPriceChange(buyLimit, 190.251, market).blockers).toContain("Price didn't change.");
    const [locked] = normalizeSchwabOrders([schwab({ filledQuantity: 10, remainingQuantity: 90 })], "AAPL", HASH);
    expect(checkPriceChange(locked, 189, market).blockers.length).toBeGreaterThan(0);
  });
});

describe("position P&L", () => {
  it("is positive for a long when price rises and for a short when it falls", () => {
    expect(positionPnl({ key: "a", source: "paper", symbol: "AAPL", quantity: 100, avgPrice: 100 }, 101)).toEqual({ dollars: 100, percent: 1 });
    expect(positionPnl({ key: "b", source: "paper", symbol: "AAPL", quantity: -100, avgPrice: 100 }, 99)).toEqual({ dollars: 100, percent: 1 });
  });
});
