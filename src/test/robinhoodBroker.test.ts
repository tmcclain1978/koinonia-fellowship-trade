import { describe, it, expect } from "vitest";
import { buildArgs, MappingError, orderStateFrom, parseToolResult, robinhoodBroker, type ToolDescriptor } from "../../supabase/functions/_shared/bot/robinhood-broker";

const orderSchema = {
  type: "object",
  properties: {
    symbol: { type: "string" },
    side: { type: "string", enum: ["buy", "sell"] },
    quantity: { type: "string" },
    type: { type: "string", enum: ["market", "limit", "stop_limit", "stop_market"] },
    stop_price: { type: "number" },
    time_in_force: { type: "string", enum: ["gfd", "gtc"] },
    ref_id: { type: "string" },
  },
  required: ["symbol", "side", "quantity", "type"],
};
const tools: ToolDescriptor[] = [
  { name: "review_equity_order", inputSchema: orderSchema },
  { name: "place_equity_order", inputSchema: orderSchema },
  { name: "cancel_equity_order", inputSchema: { properties: { order_id: { type: "string" } }, required: ["order_id"] } },
  { name: "get_equity_orders", inputSchema: { properties: { order_id: { type: "string" } } } },
  { name: "get_equity_positions", inputSchema: { properties: {} } },
  { name: "get_equity_quotes", inputSchema: { properties: { symbols: { type: "array", items: { type: "string" } } }, required: ["symbols"] } },
  { name: "get_portfolio", inputSchema: { properties: {} } },
];
const text = (o: unknown) => ({ content: [{ type: "text", text: JSON.stringify(o) }] });

describe("building Robinhood arguments from the tool's schema", () => {
  it("fills market and stop orders using the schema's names and allowed values", () => {
    const m = buildArgs(tools[1], { symbol: "spy", side: "buy", quantity: 3, kind: "market", refId: "r1" });
    expect(m).toEqual({ symbol: "SPY", side: "buy", quantity: "3", type: "market", time_in_force: "gfd", ref_id: "r1" });
    const s = buildArgs(tools[1], { symbol: "SPY", side: "sell", quantity: 3, kind: "stop", stopPrice: 99.123 });
    expect(s).toMatchObject({ type: "stop_market", stop_price: 99.12, side: "sell" });
  });

  it("wraps array fields and supports the type+trigger style", () => {
    expect(buildArgs(tools[5], { symbol: "SPY" })).toEqual({ symbols: ["SPY"] });
    const legacy: ToolDescriptor = { name: "place_equity_order", inputSchema: { properties: { symbol: {}, side: { enum: ["buy", "sell"] }, quantity: {}, type: { enum: ["market", "limit"] }, trigger: { enum: ["immediate", "stop"] }, stop_price: {} }, required: ["symbol", "side", "quantity", "type", "trigger"] } };
    expect(buildArgs(legacy, { symbol: "SPY", side: "sell", quantity: 1, kind: "stop", stopPrice: 10 })).toMatchObject({ type: "market", trigger: "stop", stop_price: 10 });
  });

  it("refuses when a required field is unknown or a value isn't allowed (never guesses)", () => {
    const needsAccount: ToolDescriptor = { name: "place_equity_order", inputSchema: { properties: { ...orderSchema.properties, account_number: { type: "string" }, mystery: { type: "string" } }, required: ["symbol", "mystery"] } };
    expect(() => buildArgs(needsAccount, { symbol: "SPY", side: "buy", quantity: 1, kind: "market" })).toThrow(MappingError);
    const noStops: ToolDescriptor = { name: "place_equity_order", inputSchema: { properties: { ...orderSchema.properties, type: { enum: ["market", "limit"] } } } };
    expect(() => buildArgs(noStops, { symbol: "SPY", side: "sell", quantity: 1, kind: "stop", stopPrice: 5 })).toThrow(/not allowed/);
  });

  it("uses the saved account when the schema asks for one", () => {
    const acct: ToolDescriptor = { name: "place_equity_order", inputSchema: { properties: { ...orderSchema.properties, account_number: { type: "string" } }, required: ["account_number", "symbol"] } };
    expect(buildArgs(acct, { symbol: "SPY", side: "buy", quantity: 1, kind: "market", account: "5RH123" }).account_number).toBe("5RH123");
    expect(() => buildArgs(acct, { symbol: "SPY", side: "buy", quantity: 1, kind: "market" })).toThrow(/account_number/);
  });
});

describe("reading Robinhood results", () => {
  it("parses structured content, JSON text, and JSON inside prose", () => {
    expect(parseToolResult({ structuredContent: { id: "1" } }).data).toEqual({ id: "1" });
    expect(parseToolResult(text({ id: "2" })).data).toEqual({ id: "2" });
    expect(parseToolResult({ content: [{ type: "text", text: 'Order placed: {"id":"3","state":"queued"}' }] }).data).toEqual({ id: "3", state: "queued" });
    expect(parseToolResult({ isError: true, content: [{ type: "text", text: "nope" }] }).ok).toBe(false);
  });

  it("maps order states", () => {
    expect(orderStateFrom({ state: "filled", average_price: "101.5", cumulative_quantity: "3" })).toEqual({ status: "filled", fillPrice: 101.5, filledQty: 3 });
    expect(orderStateFrom({ state: "queued" }).status).toBe("open");
    expect(orderStateFrom({ state: "cancelled", cumulative_quantity: "0" }).status).toBe("cancelled");
    expect(orderStateFrom({ state: "cancelled", cumulative_quantity: "2" }).status).toBe("filled");
    expect(orderStateFrom({ state: "rejected" }).status).toBe("rejected");
    expect(orderStateFrom({ order: { status: "partially_filled" } }).status).toBe("open");
  });
});

describe("Robinhood broker", () => {
  function fakeMcp(responses: Record<string, (args: any) => unknown>) {
    const calls: Array<{ name: string; args: any }> = [];
    return { calls, callTool: async (name: string, args: any) => { calls.push({ name, args }); return responses[name]?.(args) ?? text({}); } };
  }

  it("reviews every order before placing it", async () => {
    const mcp = fakeMcp({ review_equity_order: () => text({ warnings: [] }), place_equity_order: () => text({ id: "o1", state: "queued" }) });
    const r = await robinhoodBroker(mcp, tools).buyMarket("SPY", 2, 500);
    expect(r).toMatchObject({ status: "pending", orderId: "o1" });
    expect(mcp.calls.map((c) => c.name)).toEqual(["review_equity_order", "place_equity_order"]);
    expect(mcp.calls[0].args.ref_id).toBe(mcp.calls[1].args.ref_id);
  });

  it("doesn't place when the review flags an error, or report success without an order id", async () => {
    const bad = fakeMcp({ review_equity_order: () => text({ error: "Insufficient buying power" }) });
    expect(await robinhoodBroker(bad, tools).buyMarket("SPY", 2, 500)).toMatchObject({ status: "rejected", message: expect.stringMatching(/Insufficient/) });
    expect(bad.calls.some((c) => c.name === "place_equity_order")).toBe(false);
    const noId = fakeMcp({ place_equity_order: () => text({ message: "Waiting for your approval in the app" }) });
    expect(await robinhoodBroker(noId, tools).buyMarket("SPY", 1, 500)).toMatchObject({ status: "rejected", message: expect.stringMatching(/no order id/) });
  });

  it("missing tools or unmappable schemas reject instead of throwing", async () => {
    const r = await robinhoodBroker(fakeMcp({}), tools.filter((t) => t.name !== "place_equity_order")).buyMarket("SPY", 1, 1);
    expect(r).toMatchObject({ status: "rejected", message: expect.stringMatching(/isn't available/) });
  });

  it("reads quotes, positions, account and order state", async () => {
    const mcp = fakeMcp({
      get_equity_quotes: () => text({ results: [{ symbol: "SPY", bid_price: "499.9", ask_price: "500.1", last_trade_price: "500" }] }),
      get_equity_positions: () => text({ results: [{ symbol: "SPY", quantity: "4.0000" }, { symbol: "AAPL", quantity: "1" }] }),
      get_portfolio: () => text({ equity: "30123.45", buying_power: "12000" }),
      get_equity_orders: (a) => text({ results: [{ id: "x" }, { id: a.order_id, state: "filled", average_price: "10", cumulative_quantity: "1" }] }),
    });
    const b = robinhoodBroker(mcp, tools);
    expect(await b.quote("SPY")).toMatchObject({ bid: 499.9, ask: 500.1, last: 500 });
    expect(await b.positionQty("SPY")).toBe(4);
    expect(await b.positionQty("TSLA")).toBe(0);
    expect(await b.account()).toEqual({ equity: 30123.45, buyingPower: 12000 });
    expect(await b.order("o9")).toEqual({ status: "filled", fillPrice: 10, filledQty: 1 });
  });

  it("cancel reports a fill that happened first", async () => {
    const mcp = fakeMcp({ get_equity_orders: (a) => text([{ id: a.order_id, state: "filled", average_price: "9.5", cumulative_quantity: "2" }]) });
    expect(await robinhoodBroker(mcp, tools).cancel("s1")).toMatchObject({ status: "filled", fillPrice: 9.5 });
  });
});
