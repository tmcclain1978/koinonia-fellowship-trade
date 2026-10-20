/**
 * Orders and positions as the chart sees them, plus the checks that run
 * before any price change is sent. Pure functions, unit-tested.
 *
 * Safety rules (deliberately conservative for live accounts):
 *  - Only plain single-leg stock orders that are working and have not filled
 *    at all can be dragged: LIMIT, STOP, STOP_LIMIT.
 *  - Bracket / OCO legs, multi-leg, option, trailing, partly filled and
 *    market orders are shown read-only with the reason.
 *  - Every change is checked (tick size, side of the market, size of the
 *    move) and confirmed by the user before it is sent.
 */
import type { SchwabOrder } from "@/lib/schwabApi";

export type OrderSource = "schwab" | "paper";
export type OrderKind = "LIMIT" | "STOP" | "STOP_LIMIT" | "TRAILING_STOP" | "MARKET" | "OTHER";

export interface ChartOrder {
  /** Unique across sources/accounts. */
  key: string;
  source: OrderSource;
  id: string;
  accountHash?: string;
  accountLabel?: string;
  symbol: string;
  side: "buy" | "sell";
  /** Broker instruction, e.g. SELL_SHORT, BUY_TO_COVER. */
  instruction: string;
  quantity: number;
  kind: OrderKind;
  limitPrice: number | null;
  stopPrice: number | null;
  /** Price the line is drawn at (stop price for stop orders, else limit). */
  linePrice: number | null;
  status: string;
  draggable: boolean;
  cancelable: boolean;
  /** Why it can't be dragged (shown to the user). */
  lockedReason?: string;
  raw: unknown;
}

export interface ChartPosition {
  key: string;
  source: OrderSource;
  symbol: string;
  /** Positive = long, negative = short. */
  quantity: number;
  avgPrice: number;
  accountLabel?: string;
}

/* ----------------------------------------------------------------------------
 * Schwab
 * ------------------------------------------------------------------------- */

/** Statuses for orders that are still live at the broker (shown on the chart). */
const SCHWAB_OPEN = new Set([
  "WORKING", "PENDING_ACTIVATION", "QUEUED", "ACCEPTED", "NEW",
  "AWAITING_PARENT_ORDER", "AWAITING_CONDITION", "AWAITING_STOP_CONDITION",
  "AWAITING_MANUAL_REVIEW", "AWAITING_UR_OUT", "AWAITING_RELEASE_TIME",
  "PENDING_ACKNOWLEDGEMENT", "PENDING_RECALL", "PENDING_REPLACE", "PENDING_CANCEL",
]);
/** Statuses where a price change is allowed. */
const SCHWAB_EDITABLE = new Set(["WORKING", "PENDING_ACTIVATION", "QUEUED", "ACCEPTED"]);
const SCHWAB_CANCELABLE_BLOCK = new Set(["PENDING_CANCEL", "PENDING_REPLACE"]);

const BUY_INSTRUCTIONS = new Set(["BUY", "BUY_TO_COVER", "BUY_TO_OPEN", "BUY_TO_CLOSE"]);

const toNum = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

const schwabKind = (t: unknown): OrderKind => {
  switch (String(t)) {
    case "LIMIT": return "LIMIT";
    case "STOP": return "STOP";
    case "STOP_LIMIT": return "STOP_LIMIT";
    case "TRAILING_STOP":
    case "TRAILING_STOP_LIMIT": return "TRAILING_STOP";
    case "MARKET": return "MARKET";
    default: return "OTHER";
  }
};

const linePriceFor = (kind: OrderKind, limit: number | null, stop: number | null) =>
  kind === "STOP" || kind === "STOP_LIMIT" || kind === "TRAILING_STOP" ? stop : limit;

interface SchwabRawOrder {
  orderId?: number | string;
  status?: string;
  orderType?: string;
  orderStrategyType?: string;
  price?: number | string;
  stopPrice?: number | string;
  quantity?: number;
  filledQuantity?: number;
  remainingQuantity?: number;
  editable?: boolean;
  cancelable?: boolean;
  accountNumber?: number | string;
  orderLegCollection?: Array<{ instruction?: string; quantity?: number; instrument?: { symbol?: string; assetType?: string } }>;
  childOrderStrategies?: SchwabRawOrder[];
  [k: string]: unknown;
}

/**
 * Flatten Schwab orders (including bracket children) into chart orders for
 * one symbol. `hashByAccount` maps account numbers to the hashed IDs the API
 * needs for changes.
 */
export function normalizeSchwabOrders(
  orders: unknown[],
  symbol: string,
  hashByAccount: Record<string, string>,
): ChartOrder[] {
  const sym = symbol.toUpperCase();
  const out: ChartOrder[] = [];

  const visit = (o: SchwabRawOrder, linked: boolean, accountNumber?: string) => {
    const acct = String(o.accountNumber ?? accountNumber ?? "");
    const children = Array.isArray(o.childOrderStrategies) ? o.childOrderStrategies : [];
    const isLinked = linked || children.length > 0 || (o.orderStrategyType && o.orderStrategyType !== "SINGLE");
    // An OCO/TRIGGER container has no legs of its own; its children are the orders.
    children.forEach((c) => visit(c, true, acct));

    const legs = Array.isArray(o.orderLegCollection) ? o.orderLegCollection : [];
    if (legs.length === 0) return;
    const leg = legs[0];
    if (String(leg.instrument?.symbol ?? "").toUpperCase() !== sym) return;
    const status = String(o.status ?? "");
    if (!SCHWAB_OPEN.has(status)) return;

    const kind = schwabKind(o.orderType);
    const limitPrice = toNum(o.price);
    const stopPrice = toNum(o.stopPrice);
    const instruction = String(leg.instruction ?? "");
    const filled = toNum(o.filledQuantity) ?? 0;
    const total = toNum(o.quantity) ?? toNum(leg.quantity) ?? 0;
    const remaining = toNum(o.remainingQuantity) ?? total - filled;
    const hash = hashByAccount[acct];

    let lockedReason: string | undefined;
    if (legs.length > 1) lockedReason = "Multi-leg order: change it in the order ticket.";
    else if (leg.instrument?.assetType && leg.instrument.assetType !== "EQUITY") lockedReason = "Option orders can't be dragged yet.";
    else if (isLinked) lockedReason = "Part of a bracket / OCO order: change it in the order ticket.";
    else if (kind === "TRAILING_STOP") lockedReason = "Trailing stops follow the price and can't be dragged.";
    else if (kind === "MARKET" || kind === "OTHER") lockedReason = "Only limit and stop orders can be dragged.";
    else if (filled > 0) lockedReason = "Partly filled: change the rest in the order ticket.";
    else if (!SCHWAB_EDITABLE.has(status)) lockedReason = `Order is ${status.toLowerCase().replace(/_/g, " ")}.`;
    else if (o.editable === false) lockedReason = "Schwab reports this order can't be edited.";
    else if (!hash) lockedReason = "Account not linked.";

    out.push({
      key: `schwab:${acct}:${o.orderId}`,
      source: "schwab",
      id: String(o.orderId ?? ""),
      accountHash: hash,
      accountLabel: acct ? `…${acct.slice(-4)}` : undefined,
      symbol: sym,
      side: BUY_INSTRUCTIONS.has(instruction) ? "buy" : "sell",
      instruction,
      quantity: remaining,
      kind,
      limitPrice,
      stopPrice,
      linePrice: linePriceFor(kind, limitPrice, stopPrice),
      status,
      draggable: !lockedReason,
      // Bracket/OCO legs: cancelling one leg can leave a position without its
      // stop, so they are managed in the order ticket, not from the chart.
      cancelable: !!hash && !isLinked && legs.length === 1 && o.cancelable !== false && !SCHWAB_CANCELABLE_BLOCK.has(status),
      lockedReason,
      raw: o,
    });
  };

  for (const o of orders) if (o && typeof o === "object") visit(o as SchwabRawOrder, false);
  return out.filter((o) => o.linePrice !== null);
}

/** Positions for one symbol from Schwab account details (securitiesAccount.positions). */
interface SchwabRawPosition {
  instrument?: { symbol?: string; assetType?: string };
  longQuantity?: number;
  shortQuantity?: number;
  averagePrice?: number;
  averageLongPrice?: number;
  averageShortPrice?: number;
}
interface SchwabRawAccount {
  accountNumber?: string | number;
  positions?: SchwabRawPosition[];
  securitiesAccount?: SchwabRawAccount;
}

export function normalizeSchwabPositions(accounts: unknown[], symbol: string): ChartPosition[] {
  const sym = symbol.toUpperCase();
  const out: ChartPosition[] = [];
  for (const a of accounts as SchwabRawAccount[]) {
    const sa = a?.securitiesAccount ?? a;
    const acct = String(sa?.accountNumber ?? "");
    for (const p of sa?.positions ?? []) {
      if (String(p?.instrument?.symbol ?? "").toUpperCase() !== sym) continue;
      if (p?.instrument?.assetType && p.instrument.assetType !== "EQUITY") continue;
      const long = toNum(p.longQuantity) ?? 0;
      const short = toNum(p.shortQuantity) ?? 0;
      const qty = long - short;
      const avg = toNum(qty >= 0 ? p.averageLongPrice ?? p.averagePrice : p.averageShortPrice ?? p.averagePrice);
      if (!qty || avg === null) continue;
      out.push({ key: `schwab:${acct}:${sym}`, source: "schwab", symbol: sym, quantity: qty, avgPrice: avg, accountLabel: acct ? `…${acct.slice(-4)}` : undefined });
    }
  }
  return out;
}

/**
 * Full replacement order for Schwab with the line moved to `newLinePrice`.
 * Schwab replaces by cancelling the old order and creating this one, so every
 * field that defines the order is carried over. For stop-limit orders the
 * limit moves by the same amount, keeping the gap between stop and limit.
 */
export function buildSchwabReplacement(order: ChartOrder, newLinePrice: number): SchwabOrder {
  const raw = order.raw as SchwabRawOrder;
  const dp = decimalsFor(newLinePrice);
  const leg = raw.orderLegCollection![0];
  const next: Record<string, unknown> = {
    orderType: raw.orderType,
    session: raw.session ?? "NORMAL",
    duration: raw.duration ?? "DAY",
    orderStrategyType: "SINGLE",
    orderLegCollection: [
      {
        instruction: leg.instruction,
        quantity: order.quantity,
        instrument: { symbol: leg.instrument!.symbol, assetType: leg.instrument!.assetType ?? "EQUITY" },
      },
    ],
  };
  for (const k of ["specialInstruction", "stopType", "cancelTime"]) if (raw[k] !== undefined) next[k] = raw[k];

  if (order.kind === "LIMIT") next.price = newLinePrice.toFixed(dp);
  if (order.kind === "STOP") next.stopPrice = newLinePrice.toFixed(dp);
  if (order.kind === "STOP_LIMIT") {
    const shift = newLinePrice - (order.stopPrice ?? newLinePrice);
    next.stopPrice = newLinePrice.toFixed(dp);
    next.price = roundToTick((order.limitPrice ?? newLinePrice) + shift).toFixed(dp);
  }
  return next as unknown as SchwabOrder;
}

/* ----------------------------------------------------------------------------
 * Paper
 * ------------------------------------------------------------------------- */

interface PaperOrderRow {
  id: string;
  symbol: string;
  side: string;
  order_type: string;
  quantity: number;
  limit_price: number | null;
  stop_price: number | null;
  status: string;
  contract_key: string | null;
  oco_group?: string | null;
  parent_order_id?: string | null;
}

const paperKind = (t: string): OrderKind =>
  t === "limit" ? "LIMIT" : t === "stop" ? "STOP" : t === "stop_limit" ? "STOP_LIMIT" : t === "trailing_stop" ? "TRAILING_STOP" : t === "market" ? "MARKET" : "OTHER";

export function normalizePaperOrders(rows: unknown[], symbol: string): ChartOrder[] {
  const sym = symbol.toUpperCase();
  return (rows as PaperOrderRow[])
    .filter((r) => r && String(r.symbol).toUpperCase() === sym && !r.contract_key && (r.status === "working" || r.status === "pending_parent"))
    .map((r) => {
      const kind = paperKind(r.order_type);
      const limitPrice = toNum(r.limit_price);
      const stopPrice = toNum(r.stop_price);
      const lockedReason =
        kind === "TRAILING_STOP" ? "Trailing stops follow the price and can't be dragged."
        : kind === "MARKET" || kind === "OTHER" ? "Only limit and stop orders can be dragged."
        : undefined;
      return {
        key: `paper:${r.id}`,
        source: "paper" as const,
        id: r.id,
        accountLabel: "Paper",
        symbol: sym,
        side: r.side === "buy" ? ("buy" as const) : ("sell" as const),
        instruction: r.side.toUpperCase(),
        quantity: Number(r.quantity),
        kind,
        limitPrice,
        stopPrice,
        linePrice: linePriceFor(kind, limitPrice, stopPrice),
        status: r.status,
        draggable: !lockedReason,
        cancelable: true,
        lockedReason,
        raw: r,
      };
    })
    .filter((o) => o.linePrice !== null);
}

export function normalizePaperPositions(rows: unknown[], symbol: string): ChartPosition[] {
  const sym = symbol.toUpperCase();
  return (rows as Array<{ id: string; symbol: string; quantity: number; avg_cost: number; contract_key: string | null }>)
    .filter((r) => r && String(r.symbol).toUpperCase() === sym && !r.contract_key && Number(r.quantity) !== 0)
    .map((r) => ({ key: `paper:${r.id}`, source: "paper" as const, symbol: sym, quantity: Number(r.quantity), avgPrice: Number(r.avg_cost), accountLabel: "Paper" }));
}

/** Column updates for a paper order moved to `newLinePrice`. */
export function paperPriceUpdate(order: ChartOrder, newLinePrice: number): { limit_price?: number; stop_price?: number } {
  if (order.kind === "LIMIT") return { limit_price: newLinePrice };
  if (order.kind === "STOP") return { stop_price: newLinePrice };
  const shift = newLinePrice - (order.stopPrice ?? newLinePrice);
  return { stop_price: newLinePrice, limit_price: roundToTick((order.limitPrice ?? newLinePrice) + shift) };
}

/* ----------------------------------------------------------------------------
 * Checks
 * ------------------------------------------------------------------------- */

/** US equities: $0.01 at $1 and above, $0.0001 below $1. */
export const tickSize = (price: number) => (price >= 1 ? 0.01 : 0.0001);
export const decimalsFor = (price: number) => (price >= 1 ? 2 : 4);
export const roundToTick = (price: number) => {
  const t = tickSize(price);
  return +(Math.round(price / t) * t).toFixed(decimalsFor(price));
};

export interface MarketSnapshot {
  last: number | null;
  bid?: number | null;
  ask?: number | null;
}

export interface PriceChangeCheck {
  /** Rounded to a valid tick. */
  price: number;
  /** Things to confirm (shown in the dialog). */
  warnings: string[];
  /** Reasons the change can't be sent. */
  blockers: string[];
}

const BIG_MOVE_PCT = 10;

export function checkPriceChange(order: ChartOrder, rawNewPrice: number, market: MarketSnapshot): PriceChangeCheck {
  const warnings: string[] = [];
  const blockers: string[] = [];
  const price = Number.isFinite(rawNewPrice) ? roundToTick(rawNewPrice) : NaN;

  if (!order.draggable) blockers.push(order.lockedReason ?? "This order can't be changed from the chart.");
  if (!Number.isFinite(price) || price <= 0) blockers.push("Price must be above zero.");
  else if (order.linePrice !== null && price === roundToTick(order.linePrice)) blockers.push("Price didn't change.");

  if (order.kind === "STOP_LIMIT" && Number.isFinite(price)) {
    const newLimit = (order.limitPrice ?? price) + (price - (order.stopPrice ?? price));
    if (newLimit <= 0) blockers.push("The limit price would fall below zero.");
  }

  const last = market.last ?? null;
  const bid = market.bid ?? last;
  const ask = market.ask ?? last;
  if (Number.isFinite(price) && last !== null) {
    if (order.kind === "LIMIT") {
      if (order.side === "buy" && ask !== null && price >= ask) warnings.push(`Buy limit at or above the ask ($${ask.toFixed(2)}): it will likely fill right away.`);
      if (order.side === "sell" && bid !== null && price <= bid) warnings.push(`Sell limit at or below the bid ($${bid.toFixed(2)}): it will likely fill right away.`);
    }
    if (order.kind === "STOP" || order.kind === "STOP_LIMIT") {
      if (order.side === "buy" && price <= last) warnings.push(`Buy stop at or below the last price ($${last.toFixed(2)}): it will trigger right away.`);
      if (order.side === "sell" && price >= last) warnings.push(`Sell stop at or above the last price ($${last.toFixed(2)}): it will trigger right away.`);
    }
  }
  if (Number.isFinite(price) && order.linePrice) {
    const movePct = Math.abs(price - order.linePrice) / order.linePrice * 100;
    if (movePct > BIG_MOVE_PCT) warnings.push(`That's a ${movePct.toFixed(1)}% move from the current order price.`);
  }
  return { price, warnings, blockers };
}

/** Unrealized P&L of a position at `last`. */
export function positionPnl(pos: ChartPosition, last: number | null): { dollars: number; percent: number } | null {
  if (last === null || !pos.avgPrice) return null;
  const dollars = (last - pos.avgPrice) * pos.quantity;
  const percent = ((last - pos.avgPrice) / pos.avgPrice) * 100 * Math.sign(pos.quantity);
  return { dollars, percent };
}

/** One-line label for an order line, e.g. "BUY LMT 100 @ 190.25". */
export function orderLabel(o: ChartOrder): string {
  const kind = { LIMIT: "LMT", STOP: "STP", STOP_LIMIT: "STP LMT", TRAILING_STOP: "TRAIL", MARKET: "MKT", OTHER: "" }[o.kind];
  const px = o.linePrice !== null ? o.linePrice.toFixed(decimalsFor(o.linePrice)) : "";
  const extra = o.kind === "STOP_LIMIT" && o.limitPrice !== null ? ` (lmt ${o.limitPrice.toFixed(decimalsFor(o.limitPrice))})` : "";
  const acct = o.accountLabel && o.source === "schwab" ? ` ${o.accountLabel}` : "";
  return `${o.side.toUpperCase()} ${kind} ${o.quantity} @ ${px}${extra}${acct}`;
}
