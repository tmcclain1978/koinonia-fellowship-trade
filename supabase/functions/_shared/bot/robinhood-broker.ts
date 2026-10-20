/**
 * Live broker through Robinhood's Trading MCP (agent.robinhood.com/mcp/trading).
 *
 * Robinhood documents the tool names (get_equity_quotes, get_equity_positions,
 * get_equity_orders, review_equity_order, place_equity_order,
 * cancel_equity_order, ...) but not their argument names. So arguments are
 * built from each tool's own input schema, matching common field names. If a
 * required field can't be filled, the call is refused: nothing is sent on a
 * guess. Every order is reviewed with review_equity_order first.
 */
import type { Broker, OrderResult, OrderState } from "./broker.ts";
import type { Quote } from "./market-data.ts";

export interface ToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: { type?: string; properties?: Record<string, any>; required?: string[] };
}

export interface McpLike {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/* ----------------------------------------------------------------------------
 * Argument mapping (pure)
 * ------------------------------------------------------------------------- */

/** Canonical order fields → names Robinhood's schemas might use. */
const ALIASES: Record<string, string[]> = {
  symbol: ["symbol", "ticker", "instrument_symbol", "symbols"],
  side: ["side", "direction", "action", "order_side"],
  quantity: ["quantity", "qty", "shares", "share_quantity"],
  type: ["type", "order_type", "orderType"],
  trigger: ["trigger", "trigger_type"],
  stop_price: ["stop_price", "stopPrice", "trigger_price", "stop"],
  time_in_force: ["time_in_force", "timeInForce", "tif", "duration"],
  account: ["account_number", "account_id", "accountNumber", "account"],
  ref_id: ["ref_id", "client_order_id", "idempotency_key", "client_id"],
  order_id: ["order_id", "id", "orderId"],
  extended_hours: ["extended_hours", "extendedHours"],
};

export class MappingError extends Error {}

function pickEnum(prop: any, wanted: string[]): string | undefined {
  const values: string[] | undefined = prop?.enum ?? prop?.items?.enum;
  if (!values) return wanted[0];
  for (const w of wanted) {
    const hit = values.find((v) => String(v).toLowerCase() === w);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

export interface CanonicalOrder {
  symbol?: string;
  side?: "buy" | "sell";
  quantity?: number;
  kind?: "market" | "stop";
  stopPrice?: number;
  account?: string | null;
  refId?: string;
  orderId?: string;
}

/**
 * Build the arguments for `tool` from a canonical order. Throws MappingError
 * when a required field is unknown or a value isn't allowed by the schema.
 */
export function buildArgs(tool: ToolDescriptor, o: CanonicalOrder): Record<string, unknown> {
  const props = tool.inputSchema?.properties ?? {};
  const required = new Set(tool.inputSchema?.required ?? []);
  const args: Record<string, unknown> = {};
  const find = (key: string) => ALIASES[key].find((n) => n in props);
  const set = (key: string, value: unknown) => {
    const name = find(key);
    if (!name || value === undefined || value === null) return;
    const p = props[name];
    if (p?.type === "array") args[name] = [value];
    else if (p?.type === "string" && typeof value === "number") args[name] = String(value);
    else if ((p?.type === "number" || p?.type === "integer") && typeof value === "string") args[name] = Number(value);
    else args[name] = value;
  };

  set("symbol", o.symbol?.toUpperCase());
  set("quantity", o.quantity);
  set("account", o.account ?? undefined);
  set("ref_id", o.refId);
  set("order_id", o.orderId);

  const sideName = find("side");
  if (sideName && o.side) {
    const v = pickEnum(props[sideName], [o.side]);
    if (v === undefined) throw new MappingError(`${tool.name}: side "${o.side}" not allowed`);
    args[sideName] = v;
  }
  const typeName = find("type");
  if (typeName && o.kind) {
    const wanted = o.kind === "market" ? ["market"] : ["stop", "stop_market", "stop_loss", "stopmarket"];
    let v = pickEnum(props[typeName], wanted);
    // Older Robinhood style: type=market + trigger=stop.
    if (v === undefined && o.kind === "stop" && find("trigger")) v = pickEnum(props[typeName], ["market"]);
    if (v === undefined) throw new MappingError(`${tool.name}: order type "${o.kind}" not allowed`);
    args[typeName] = v;
  }
  const trig = find("trigger");
  if (trig && o.kind) {
    const v = pickEnum(props[trig], [o.kind === "stop" ? "stop" : "immediate"]);
    if (v !== undefined) args[trig] = v;
  }
  if (o.kind === "stop") {
    const sp = find("stop_price");
    if (!sp) throw new MappingError(`${tool.name}: no stop price field`);
    set("stop_price", Math.round((o.stopPrice ?? 0) * 100) / 100);
  }
  const tif = find("time_in_force");
  if (tif && o.kind) {
    const v = pickEnum(props[tif], o.kind === "stop" ? ["gfd", "day", "gtc"] : ["gfd", "day"]);
    if (v !== undefined) args[tif] = v;
  }
  const xh = find("extended_hours");
  if (xh && o.kind && props[xh]?.type === "boolean") args[xh] = false;

  const missing = [...required].filter((r) => !(r in args));
  if (missing.length) throw new MappingError(`${tool.name}: don't know how to fill required field(s) ${missing.join(", ")}`);
  return args;
}

/* ----------------------------------------------------------------------------
 * Result parsing (pure)
 * ------------------------------------------------------------------------- */

/** MCP tool result → plain object (structuredContent, or JSON inside the text). */
export function parseToolResult(res: any): { ok: boolean; data: any; text: string } {
  const text = Array.isArray(res?.content) ? res.content.filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n") : "";
  let data = res?.structuredContent ?? null;
  if (data === null && text) {
    try { data = JSON.parse(text); } catch { data = null; }
    if (data === null) {
      const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (m) { try { data = JSON.parse(m[0]); } catch { /* text only */ } }
    }
  }
  return { ok: res?.isError !== true, data, text };
}

/** Find the first value for any of `keys`, searching nested objects/arrays. */
export function dig(obj: any, keys: string[], depth = 0): any {
  if (obj === null || typeof obj !== "object" || depth > 5) return undefined;
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  for (const v of Object.values(obj)) {
    const hit = dig(v, keys, depth + 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

const toNum = (v: any) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function orderStateFrom(data: any): OrderState {
  const raw = String(dig(data, ["state", "status", "order_state"]) ?? "").toLowerCase();
  const filledQty = toNum(dig(data, ["cumulative_quantity", "filled_quantity", "filledQuantity", "executed_quantity"])) ?? 0;
  const fillPrice = toNum(dig(data, ["average_price", "average_fill_price", "avg_price", "executed_price"]));
  let status: OrderState["status"] = "unknown";
  if (raw === "filled") status = "filled";
  else if (["cancelled", "canceled"].includes(raw)) status = filledQty > 0 ? "filled" : "cancelled";
  else if (["rejected", "failed"].includes(raw)) status = "rejected";
  else if (["queued", "unconfirmed", "confirmed", "partially_filled", "pending", "open", "new", "accepted", "pending_cancel"].includes(raw)) status = "open";
  return { status, fillPrice, filledQty };
}

/* ----------------------------------------------------------------------------
 * Broker
 * ------------------------------------------------------------------------- */

export interface RobinhoodOptions {
  /** Agentic account number (when the tools want one). */
  account?: string | null;
  /** Called with every tool call, for the audit log. */
  audit?: (tool: string, args: unknown, result: unknown) => void;
}

export function robinhoodBroker(mcp: McpLike, tools: ToolDescriptor[], opts: RobinhoodOptions = {}): Broker {
  const byName = new Map(tools.map((t) => [t.name, t]));
  const tool = (name: string) => {
    const t = byName.get(name);
    if (!t) throw new MappingError(`Robinhood tool ${name} isn't available on this connection`);
    return t;
  };
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await mcp.callTool(name, args);
    opts.audit?.(name, args, res);
    return parseToolResult(res);
  };
  const ref = () => crypto.randomUUID();

  const place = async (o: CanonicalOrder): Promise<OrderResult> => {
    try {
      const base = { ...o, account: opts.account ?? null, refId: ref() };
      // 1. Review (simulation). Anything it flags as an error stops the order.
      const review = await call("review_equity_order", buildArgs(tool("review_equity_order"), base));
      const reviewError = !review.ok || dig(review.data, ["error", "errors", "rejection_reason"]);
      if (reviewError) return { status: "rejected", orderId: null, fillPrice: null, message: `review: ${typeof reviewError === "string" ? reviewError : review.text.slice(0, 200)}` };
      // 2. Place.
      const res = await call("place_equity_order", buildArgs(tool("place_equity_order"), base));
      if (!res.ok) return { status: "rejected", orderId: null, fillPrice: null, message: res.text.slice(0, 300) || "rejected" };
      const orderId = dig(res.data, ["order_id", "id", "orderId"]);
      if (!orderId) {
        // Approval required, or an answer we can't read: treat as not placed, loudly.
        return { status: "rejected", orderId: null, fillPrice: null, message: `no order id in the response: ${res.text.slice(0, 200)}` };
      }
      const st = orderStateFrom(res.data);
      return { status: st.status === "filled" ? "filled" : st.status === "rejected" ? "rejected" : "pending", orderId: String(orderId), fillPrice: st.fillPrice, message: "sent" };
    } catch (e) {
      return { status: "rejected", orderId: null, fillPrice: null, message: (e as Error).message };
    }
  };

  const getOrder = async (orderId: string): Promise<OrderState> => {
    try {
      const res = await call("get_equity_orders", buildArgs(tool("get_equity_orders"), { orderId, account: opts.account ?? null }));
      const list = Array.isArray(res.data) ? res.data : dig(res.data, ["orders", "results"]) ?? [res.data];
      const hit = (Array.isArray(list) ? list : [list]).find((x: any) => String(dig(x, ["id", "order_id", "orderId"])) === String(orderId));
      return hit ? orderStateFrom(hit) : { status: "unknown", fillPrice: null, filledQty: 0 };
    } catch {
      return { status: "unknown", fillPrice: null, filledQty: 0 };
    }
  };

  return {
    name: "robinhood",
    mode: "live",
    holdsStops: true,
    async account() {
      // Equity/buying power come from the portfolio tool when present; otherwise
      // the engine refuses to size (null equity would mean trading blind).
      const name = tools.find((t) => /^(get_)?(portfolio|account)s?(_details|_summary)?$/i.test(t.name))?.name;
      if (!name) throw new Error("No Robinhood account/portfolio tool found to read buying power");
      const res = await call(name, buildArgs(tool(name), { account: opts.account ?? null }));
      const equity = toNum(dig(res.data, ["equity", "total_equity", "portfolio_value", "market_value", "total_value"]));
      const bp = toNum(dig(res.data, ["buying_power", "buyingPower", "cash_available_for_trading", "cash"]));
      if (equity === null || bp === null) throw new Error(`Couldn't read equity/buying power from ${name}`);
      return { equity, buyingPower: bp };
    },
    async quote(symbol): Promise<Quote | null> {
      try {
        const res = await call("get_equity_quotes", buildArgs(tool("get_equity_quotes"), { symbol }));
        const bid = toNum(dig(res.data, ["bid_price", "bid", "bidPrice"]));
        const ask = toNum(dig(res.data, ["ask_price", "ask", "askPrice"]));
        const last = toNum(dig(res.data, ["last_trade_price", "last", "lastPrice", "price"]));
        if (!bid && !ask && !last) return null;
        return { bid, ask, last, time: Date.now() };
      } catch {
        return null;
      }
    },
    buyMarket: (symbol, qty) => place({ symbol, side: "buy", quantity: qty, kind: "market" }),
    sellMarket: (symbol, qty) => place({ symbol, side: "sell", quantity: qty, kind: "market" }),
    placeStop: (symbol, qty, stop) => place({ symbol, side: "sell", quantity: qty, kind: "stop", stopPrice: stop }),
    async cancel(orderId) {
      try {
        await call("cancel_equity_order", buildArgs(tool("cancel_equity_order"), { orderId, account: opts.account ?? null }));
      } catch { /* check the state below either way */ }
      // Wait briefly for the cancel (or a fill) to show up.
      for (let i = 0; i < 4; i++) {
        const st = await getOrder(orderId);
        if (st.status === "cancelled" || st.status === "filled" || st.status === "rejected") return st.status === "rejected" ? { ...st, status: "cancelled" } : st;
        await new Promise((r) => setTimeout(r, 750));
      }
      return { status: "unknown", fillPrice: null, filledQty: 0 };
    },
    order: getOrder,
    async positionQty(symbol) {
      try {
        const res = await call("get_equity_positions", buildArgs(tool("get_equity_positions"), { account: opts.account ?? null }));
        const list = Array.isArray(res.data) ? res.data : dig(res.data, ["positions", "results"]) ?? [];
        const hit = (Array.isArray(list) ? list : []).find((p: any) => String(dig(p, ["symbol", "ticker"]) ?? "").toUpperCase() === symbol.toUpperCase());
        return hit ? toNum(dig(hit, ["quantity", "shares", "qty"])) ?? 0 : 0;
      } catch {
        return null;
      }
    },
  };
}
