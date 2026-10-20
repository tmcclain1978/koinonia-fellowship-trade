/**
 * Loading orders/positions for the chart and sending changes, for live
 * (Schwab) and paper accounts. The broker calls sit behind `TradingBackend`
 * so the safety logic can be tested without a broker.
 */
import { supabase } from "@/integrations/supabase/client";
import { schwabApi, type SchwabOrder } from "@/lib/schwabApi";
import {
  type ChartOrder, type ChartPosition,
  normalizeSchwabOrders, normalizeSchwabPositions, normalizePaperOrders, normalizePaperPositions,
  buildSchwabReplacement, paperPriceUpdate, roundToTick,
} from "./chartOrders";

export type TradingMode = "live" | "paper";

export interface TradingBackend {
  linkedAccounts(): Promise<Array<{ accountNumber: string; hashValue: string }>>;
  liveOrders(): Promise<unknown[]>;
  liveAccounts(): Promise<unknown[]>;
  liveOrder(hash: string, id: string): Promise<unknown>;
  replaceLive(hash: string, id: string, order: SchwabOrder): Promise<{ success: boolean; orderId?: string }>;
  cancelLive(hash: string, id: string): Promise<{ success: boolean }>;
  paperOrders(symbol: string): Promise<unknown[]>;
  paperPositions(symbol: string): Promise<unknown[]>;
  /** Update only if still working; returns the rows that changed. */
  updatePaperOrder(id: string, patch: Record<string, unknown>): Promise<unknown[]>;
}

const DAY = 86_400_000;

// Linked accounts rarely change; don't refetch them on every 10-second refresh.
let linkedCache: { at: number; value: Array<{ accountNumber: string; hashValue: string }> } | null = null;
const LINKED_TTL_MS = 10 * 60_000;

export const defaultBackend: TradingBackend = {
  linkedAccounts: async () => {
    if (linkedCache && Date.now() - linkedCache.at < LINKED_TTL_MS) return linkedCache.value;
    const value = await schwabApi.getLinkedAccounts();
    linkedCache = { at: Date.now(), value };
    return value;
  },
  liveOrders: () =>
    schwabApi.getAllOrders({
      fromEnteredTime: new Date(Date.now() - 60 * DAY).toISOString(),
      toEnteredTime: new Date(Date.now() + DAY).toISOString(),
      maxResults: 500,
    }),
  liveAccounts: () => schwabApi.getAccountDetailsAll(true),
  liveOrder: (hash, id) => schwabApi.getOrder(hash, id),
  replaceLive: (hash, id, order) => schwabApi.replaceOrder(hash, id, order),
  cancelLive: (hash, id) => schwabApi.cancelOrder(hash, id),
  paperOrders: async (symbol) => {
    const { data, error } = await supabase.from("paper_orders").select("*").eq("symbol", symbol.toUpperCase()).in("status", ["working", "pending_parent"]);
    if (error) throw error;
    return data ?? [];
  },
  paperPositions: async (symbol) => {
    const { data, error } = await supabase.from("paper_positions").select("*").eq("symbol", symbol.toUpperCase());
    if (error) throw error;
    return data ?? [];
  },
  updatePaperOrder: async (id, patch) => {
    const { data, error } = await supabase
      .from("paper_orders")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", ["working", "pending_parent"])
      .select();
    if (error) throw error;
    return data ?? [];
  },
};

export interface TradingSnapshot {
  orders: ChartOrder[];
  positions: ChartPosition[];
}

export async function loadTrading(backend: TradingBackend, mode: TradingMode, symbol: string): Promise<TradingSnapshot> {
  if (mode === "paper") {
    const [orders, positions] = await Promise.all([backend.paperOrders(symbol), backend.paperPositions(symbol)]);
    return { orders: normalizePaperOrders(orders, symbol), positions: normalizePaperPositions(positions, symbol) };
  }
  const [linked, orders, accounts] = await Promise.all([backend.linkedAccounts(), backend.liveOrders(), backend.liveAccounts()]);
  const hashByAccount = Object.fromEntries(linked.map((a) => [String(a.accountNumber), a.hashValue]));
  return { orders: normalizeSchwabOrders(orders, symbol, hashByAccount), positions: normalizeSchwabPositions(accounts, symbol) };
}

export interface ActionResult {
  ok: boolean;
  message: string;
  newOrderId?: string;
}

/**
 * Re-read the order right before changing it. If anything that matters
 * changed since the user saw it (filled, cancelled, already replaced,
 * different price or size), nothing is sent.
 */
async function freshLiveOrder(backend: TradingBackend, order: ChartOrder): Promise<ChartOrder | string> {
  if (!order.accountHash) return "This order's account isn't linked.";
  const raw = await backend.liveOrder(order.accountHash, order.id);
  const [fresh] = normalizeSchwabOrders([raw], order.symbol, { [String((raw as { accountNumber?: unknown })?.accountNumber ?? "")]: order.accountHash });
  if (!fresh || fresh.id !== order.id) return "The order is no longer working (it may have filled or been cancelled). Nothing was sent.";
  if (fresh.quantity !== order.quantity || fresh.linePrice !== order.linePrice || fresh.limitPrice !== order.limitPrice) {
    return "The order changed since it was drawn. Nothing was sent; the chart has been refreshed.";
  }
  return fresh;
}

export async function changeOrderPrice(backend: TradingBackend, order: ChartOrder, newPrice: number): Promise<ActionResult> {
  const price = roundToTick(newPrice);
  try {
    if (order.source === "paper") {
      const rows = await backend.updatePaperOrder(order.id, paperPriceUpdate(order, price));
      return rows.length
        ? { ok: true, message: `Paper order moved to $${price}.` }
        : { ok: false, message: "The paper order is no longer working. Nothing was changed." };
    }
    const fresh = await freshLiveOrder(backend, order);
    if (typeof fresh === "string") return { ok: false, message: fresh };
    if (!fresh.draggable) return { ok: false, message: fresh.lockedReason ?? "This order can't be changed from the chart." };
    const result = await backend.replaceLive(fresh.accountHash!, fresh.id, buildSchwabReplacement(fresh, price));
    if (!result?.success) return { ok: false, message: "Schwab did not accept the change." };
    return {
      ok: true,
      newOrderId: result.orderId,
      message: `Order moved to $${price}.${result.orderId ? ` Schwab replaced it with order #${result.orderId}.` : ""}`,
    };
  } catch (err) {
    return { ok: false, message: `Change failed: ${(err as Error)?.message ?? err}` };
  }
}

export async function cancelChartOrder(backend: TradingBackend, order: ChartOrder): Promise<ActionResult> {
  try {
    if (order.source === "paper") {
      const rows = await backend.updatePaperOrder(order.id, { status: "cancelled" });
      return rows.length ? { ok: true, message: "Paper order cancelled." } : { ok: false, message: "The paper order is no longer working." };
    }
    if (!order.cancelable || !order.accountHash) return { ok: false, message: "This order can't be cancelled from the chart." };
    const raw = await backend.liveOrder(order.accountHash, order.id);
    const status = String((raw as { status?: unknown })?.status ?? "");
    if (["FILLED", "CANCELED", "REJECTED", "EXPIRED", "REPLACED"].includes(status)) {
      return { ok: false, message: `The order is already ${status.toLowerCase()}. Nothing was sent.` };
    }
    const result = await backend.cancelLive(order.accountHash, order.id);
    return result?.success ? { ok: true, message: "Cancel request sent to Schwab." } : { ok: false, message: "Schwab did not accept the cancel." };
  } catch (err) {
    return { ok: false, message: `Cancel failed: ${(err as Error)?.message ?? err}` };
  }
}
