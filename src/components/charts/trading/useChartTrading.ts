/**
 * Orders and positions on the chart: loads them, keeps the lines in sync,
 * and turns drags / ✕ clicks into confirmed broker actions.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Chart, OverlayCreate } from "klinecharts";
import { toast } from "sonner";
import { schwabFeed } from "@/lib/marketData";
import { type ChartOrder, type ChartPosition, checkPriceChange, decimalsFor, orderLabel, positionPnl } from "./chartOrders";
import { type TradingBackend, type TradingMode, defaultBackend, loadTrading, changeOrderPrice, cancelChartOrder } from "./tradingActions";
import { TRADE_LINE, TRADING_GROUP, registerTradeLineOverlay, type TradeLineData } from "./tradeLineOverlay";
import type { PendingTradeAction } from "./TradeConfirmDialog";

registerTradeLineOverlay();

const POLL_MS = 10_000;
const BUY_COLOR = "#16a34a";
const SELL_COLOR = "#dc2626";
const POSITION_COLOR = "#2563eb";

const overlayId = (key: string) => `trading_${key.replace(/[^a-z0-9]+/gi, "_")}`;

const money = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Options {
  chart: Chart | null;
  /** Changes whenever the chart instance is rebuilt or reloaded. */
  chartGen: number;
  symbol: string;
  /** null = feature off. */
  mode: TradingMode | null;
  visible: boolean;
  lastPrice: number | null;
  backend?: TradingBackend;
}

export function useChartTrading({ chart, chartGen, symbol, mode, visible, lastPrice, backend = defaultBackend }: Options) {
  const [orders, setOrders] = useState<ChartOrder[]>([]);
  const [positions, setPositions] = useState<ChartPosition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingTradeAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState<Set<string>>(new Set());

  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const lastPriceRef = useRef(lastPrice);
  lastPriceRef.current = lastPrice;
  const applied = useRef(new Map<string, string>()); // overlay id -> last applied state
  const chartRef = useRef<Chart | null>(null);

  /* ---- loading ------------------------------------------------------- */

  const loadSeq = useRef(0);
  const refresh = useCallback(async () => {
    if (!mode) return;
    const seq = ++loadSeq.current;
    try {
      const snap = await loadTrading(backend, mode, symbol);
      if (seq !== loadSeq.current) return;
      setOrders(snap.orders);
      setPositions(snap.positions);
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      const e = err as Error & { requiresOAuth?: boolean };
      setError(e?.requiresOAuth ? "Connect Schwab in Settings to see orders on the chart." : `Couldn't load orders: ${e?.message ?? err}`);
    }
  }, [backend, mode, symbol]);

  useEffect(() => {
    setOrders([]);
    setPositions([]);
    setError(null);
    if (!mode || !visible) return;
    void refresh();
    const id = setInterval(() => {
      // Don't move lines under the user while a confirmation is open.
      if (document.visibilityState === "visible" && !pendingRef.current) void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [mode, visible, refresh]);

  /* ---- interaction --------------------------------------------------- */

  const findOrder = (id: string) => ordersRef.current.find((o) => overlayId(o.key) === id);

  const snapBack = useCallback((order: ChartOrder) => {
    const c = chartRef.current;
    if (!c || order.linePrice === null) return;
    c.overrideOverlay({ id: overlayId(order.key), points: [{ value: order.linePrice }] });
    applied.current.delete(overlayId(order.key));
  }, []);

  const handlers = useRef<Partial<OverlayCreate>>({});
  handlers.current = {
    onPressedMoveEnd: ({ overlay }) => {
      const order = findOrder(overlay.id);
      if (!order) return false;
      const value = overlay.points[0]?.value;
      if (!order.draggable || typeof value !== "number") {
        snapBack(order);
        if (order.lockedReason) toast.info(order.lockedReason);
        return false;
      }
      const q = schwabFeed.getQuote(symbol);
      const check = checkPriceChange(order, value, {
        last: q?.isLive ? q.lastPrice : lastPriceRef.current,
        bid: q?.isLive ? q.bidPrice ?? null : null,
        ask: q?.isLive ? q.askPrice ?? null : null,
      });
      if (check.blockers.includes("Price didn't change.")) {
        snapBack(order);
        return false;
      }
      setPending({ type: "move", order, check });
      return false;
    },
    onClick: ({ overlay, figure }) => {
      const order = findOrder(overlay.id);
      if (!order) return false;
      if (figure?.key === "cancel" && order.cancelable) setPending({ type: "cancel", order });
      else if (!order.draggable && order.lockedReason) toast.info(order.lockedReason);
      return false;
    },
    // Right-click would otherwise delete the line (klinecharts default).
    onRightClick: () => true,
  } as Partial<OverlayCreate>;

  const dismiss = useCallback(() => {
    const p = pendingRef.current;
    if (p?.type === "move") snapBack(p.order);
    setPending(null);
  }, [snapBack]);

  const confirm = useCallback(async () => {
    const p = pendingRef.current;
    if (!p) return;
    setBusy(true);
    setSending((s) => new Set(s).add(p.order.key));
    const result = p.type === "move" ? await changeOrderPrice(backend, p.order, p.check.price) : await cancelChartOrder(backend, p.order);
    if (result.ok) toast.success(result.message);
    else {
      toast.error(result.message);
      if (p.type === "move") snapBack(p.order);
    }
    setSending((s) => {
      const n = new Set(s);
      n.delete(p.order.key);
      return n;
    });
    setPending(null);
    setBusy(false);
    void refresh();
  }, [backend, refresh, snapBack]);

  /* ---- drawing ------------------------------------------------------- */

  // P&L text changes on every tick; round so lines redraw only when it changes.
  const priceKey = lastPrice === null ? "" : lastPrice.toFixed(4);

  useEffect(() => {
    if (chartRef.current !== chart) {
      chartRef.current = chart;
      applied.current.clear();
    }
    if (!chart) return;
    if (!mode || !visible) {
      chart.removeOverlay({ groupId: TRADING_GROUP });
      applied.current.clear();
      return;
    }

    const desired = new Map<string, { price: number; data: TradeLineData; lock: boolean }>();
    for (const o of orders) {
      if (o.linePrice === null) continue;
      const isSending = sending.has(o.key);
      desired.set(overlayId(o.key), {
        price: o.linePrice,
        lock: !o.draggable || isSending,
        data: {
          kind: "order",
          label: orderLabel(o),
          color: o.side === "buy" ? BUY_COLOR : SELL_COLOR,
          dashed: o.kind !== "LIMIT",
          cancelable: o.cancelable,
          locked: !o.draggable,
          pending: isSending,
        },
      });
    }
    for (const p of positions) {
      const pnl = positionPnl(p, lastPrice);
      const dp = decimalsFor(p.avgPrice);
      desired.set(overlayId(p.key), {
        price: p.avgPrice,
        lock: true,
        data: {
          kind: "position",
          label: `${p.quantity > 0 ? "LONG" : "SHORT"} ${Math.abs(p.quantity)} @ ${p.avgPrice.toFixed(dp)}${p.source === "schwab" && p.accountLabel ? ` ${p.accountLabel}` : ""}`,
          color: POSITION_COLOR,
          dashed: false,
          cancelable: false,
          locked: true,
          pnlText: pnl ? `${money(pnl.dollars)} (${pnl.percent >= 0 ? "+" : ""}${pnl.percent.toFixed(2)}%)` : undefined,
          pnlColor: pnl ? (pnl.dollars >= 0 ? "#16a34a" : "#dc2626") : undefined,
        },
      });
    }

    // Remove lines for orders/positions that are gone.
    for (const id of Array.from(applied.current.keys())) {
      if (!desired.has(id)) {
        chart.removeOverlay({ id });
        applied.current.delete(id);
      }
    }

    const draggingId = pending?.type === "move" ? overlayId(pending.order.key) : null;
    desired.forEach((d, id) => {
      const state = JSON.stringify(d);
      if (applied.current.get(id) === state) return;
      const exists = applied.current.has(id) || (chart.getOverlays({ id }) ?? []).length > 0;
      if (exists) {
        // Keep the user's dragged position while they decide.
        chart.overrideOverlay({ id, extendData: d.data, lock: d.lock, ...(id === draggingId ? {} : { points: [{ value: d.price }] }) });
      } else {
        chart.createOverlay({
          name: TRADE_LINE,
          id,
          groupId: TRADING_GROUP,
          points: [{ value: d.price }],
          extendData: d.data,
          lock: d.lock,
          zLevel: 10,
          onPressedMoveEnd: (e) => handlers.current.onPressedMoveEnd!(e),
          onClick: (e) => handlers.current.onClick!(e),
          onRightClick: (e) => handlers.current.onRightClick!(e),
        } as OverlayCreate);
      }
      applied.current.set(id, state);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, chartGen, mode, visible, orders, positions, priceKey, sending, pending]);

  return {
    orders,
    positions,
    error,
    refresh,
    dialogProps: { action: pending, busy, onConfirm: () => void confirm(), onDismiss: dismiss },
  };
}
