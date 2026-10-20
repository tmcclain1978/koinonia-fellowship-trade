/**
 * What the engine needs from a broker. Paper and Robinhood implement the same
 * interface, so the same engine code runs in both modes.
 */
import type { Quote } from "./market-data.ts";
import { slip } from "./risk.ts";

export interface OrderResult {
  /** filled: done (fillPrice set); pending: accepted, not filled yet; rejected: not placed. */
  status: "filled" | "pending" | "rejected";
  orderId: string | null;
  fillPrice: number | null;
  message: string;
}

export interface OrderState {
  status: "filled" | "open" | "cancelled" | "rejected" | "unknown";
  fillPrice: number | null;
  filledQty: number;
}

export interface Broker {
  name: "paper" | "robinhood";
  mode: "paper" | "live";
  /** True when the broker holds a real stop order; false when the engine watches the stop itself. */
  holdsStops: boolean;
  /** Equity and buying power, or null when the engine computes them (paper). */
  account(): Promise<{ equity: number; buyingPower: number } | null>;
  /** Broker's own quote (live), or null to use the market-data quote. */
  quote(symbol: string): Promise<Quote | null>;
  buyMarket(symbol: string, qty: number, refPrice: number): Promise<OrderResult>;
  sellMarket(symbol: string, qty: number, refPrice: number): Promise<OrderResult>;
  placeStop(symbol: string, qty: number, stop: number): Promise<OrderResult>;
  cancel(orderId: string): Promise<OrderState>;
  order(orderId: string): Promise<OrderState>;
  /** Shares held per the broker, or null if the broker can't say (paper). */
  positionQty(symbol: string): Promise<number | null>;
}

/**
 * Paper broker: fills market orders immediately at the given price plus
 * slippage. Stops are watched by the engine on 1-minute prices.
 */
export function paperBroker(slippageBps: number): Broker {
  let n = 0;
  const id = () => `paper-${Date.now().toString(36)}-${(++n).toString(36)}`;
  return {
    name: "paper",
    mode: "paper",
    holdsStops: false,
    account: async () => null,
    quote: async () => null,
    buyMarket: async (_s, _q, ref) => ({ status: "filled", orderId: id(), fillPrice: slip(ref, "buy", slippageBps), message: "paper fill" }),
    sellMarket: async (_s, _q, ref) => ({ status: "filled", orderId: id(), fillPrice: slip(ref, "sell", slippageBps), message: "paper fill" }),
    placeStop: async () => ({ status: "rejected", orderId: null, fillPrice: null, message: "paper stops are watched by the bot" }),
    cancel: async () => ({ status: "cancelled", fillPrice: null, filledQty: 0 }),
    order: async () => ({ status: "unknown", fillPrice: null, filledQty: 0 }),
    positionQty: async () => null,
  };
}
