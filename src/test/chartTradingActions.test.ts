import { describe, it, expect, vi } from "vitest";
import { loadTrading, changeOrderPrice, cancelChartOrder, type TradingBackend } from "@/components/charts/trading/tradingActions";

const order = (o: Record<string, unknown> = {}) => ({
  orderId: 1001, accountNumber: 12345678, status: "WORKING", orderType: "LIMIT", orderStrategyType: "SINGLE",
  session: "NORMAL", duration: "DAY", quantity: 100, filledQuantity: 0, remainingQuantity: 100, price: 190.25,
  orderLegCollection: [{ instruction: "BUY", quantity: 100, instrument: { symbol: "AAPL", assetType: "EQUITY" } }],
  ...o,
});

function backend(overrides: Partial<TradingBackend> = {}): TradingBackend {
  return {
    linkedAccounts: vi.fn(async () => [{ accountNumber: "12345678", hashValue: "HASHABC" }]),
    liveOrders: vi.fn(async () => [order()]),
    liveAccounts: vi.fn(async () => []),
    liveOrder: vi.fn(async () => order()),
    replaceLive: vi.fn(async () => ({ success: true, orderId: "1002" })),
    cancelLive: vi.fn(async () => ({ success: true })),
    paperOrders: vi.fn(async () => []),
    paperPositions: vi.fn(async () => []),
    updatePaperOrder: vi.fn(async () => [{ id: "p1" }]),
    ...overrides,
  };
}

describe("live order changes", () => {
  it("re-reads the order, then replaces it with only the price changed", async () => {
    const b = backend();
    const { orders } = await loadTrading(b, "live", "AAPL");
    const r = await changeOrderPrice(b, orders[0], 189.504);
    expect(r).toMatchObject({ ok: true, newOrderId: "1002" });
    expect(b.liveOrder).toHaveBeenCalledWith("HASHABC", "1001");
    expect(b.replaceLive).toHaveBeenCalledWith("HASHABC", "1001", expect.objectContaining({ price: "189.50", orderType: "LIMIT", orderStrategyType: "SINGLE" }));
  });

  it("sends nothing if the order filled since it was drawn", async () => {
    const b = backend({ liveOrder: vi.fn(async () => order({ status: "FILLED", filledQuantity: 100, remainingQuantity: 0 })) });
    const { orders } = await loadTrading(b, "live", "AAPL");
    const r = await changeOrderPrice(b, orders[0], 189);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/no longer working/);
    expect(b.replaceLive).not.toHaveBeenCalled();
  });

  it("sends nothing if the order was changed somewhere else", async () => {
    const b = backend({ liveOrder: vi.fn(async () => order({ price: 188 })) });
    const { orders } = await loadTrading(b, "live", "AAPL");
    const r = await changeOrderPrice(b, orders[0], 189);
    expect(r.ok).toBe(false);
    expect(b.replaceLive).not.toHaveBeenCalled();
  });

  it("sends nothing if the order became partly filled", async () => {
    const b = backend({ liveOrder: vi.fn(async () => order({ filledQuantity: 10, remainingQuantity: 90 })) });
    const { orders } = await loadTrading(b, "live", "AAPL");
    expect((await changeOrderPrice(b, orders[0], 189)).ok).toBe(false);
    expect(b.replaceLive).not.toHaveBeenCalled();
  });

  it("reports broker errors instead of throwing", async () => {
    const b = backend({ replaceLive: vi.fn(async () => { throw new Error("Order not editable"); }) });
    const { orders } = await loadTrading(b, "live", "AAPL");
    const r = await changeOrderPrice(b, orders[0], 189);
    expect(r).toMatchObject({ ok: false });
    expect(r.message).toMatch(/Order not editable/);
  });

  it("does not cancel an order that already filled", async () => {
    const b = backend({ liveOrder: vi.fn(async () => order({ status: "FILLED" })) });
    const { orders } = await loadTrading(b, "live", "AAPL");
    const r = await cancelChartOrder(b, orders[0]);
    expect(r.ok).toBe(false);
    expect(b.cancelLive).not.toHaveBeenCalled();
  });

  it("cancels a working order", async () => {
    const b = backend();
    const { orders } = await loadTrading(b, "live", "AAPL");
    expect((await cancelChartOrder(b, orders[0])).ok).toBe(true);
    expect(b.cancelLive).toHaveBeenCalledWith("HASHABC", "1001");
  });
});

describe("paper order changes", () => {
  const paperRow = { id: "p1", symbol: "AAPL", side: "sell", order_type: "stop", quantity: 10, limit_price: null, stop_price: 180, status: "working", contract_key: null };

  it("updates the paper order's stop price", async () => {
    const b = backend({ paperOrders: vi.fn(async () => [paperRow]) });
    const { orders } = await loadTrading(b, "paper", "AAPL");
    expect((await changeOrderPrice(b, orders[0], 178.456)).ok).toBe(true);
    expect(b.updatePaperOrder).toHaveBeenCalledWith("p1", { stop_price: 178.46 });
  });

  it("reports when the paper order is no longer working", async () => {
    const b = backend({ paperOrders: vi.fn(async () => [paperRow]), updatePaperOrder: vi.fn(async () => []) });
    const { orders } = await loadTrading(b, "paper", "AAPL");
    expect((await changeOrderPrice(b, orders[0], 178)).ok).toBe(false);
  });
});
