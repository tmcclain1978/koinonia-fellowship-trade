import { useEffect, useMemo, useState, useCallback } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, RefreshCw, X, Plus, Play, Eye, Search,
  Target, ShieldAlert, TrendingUp, TrendingDown, Link2,
  ArrowUpFromLine, ArrowDownFromLine, RotateCcw
} from "lucide-react";
import { safeToFixed } from "@/lib/safeNumber";

type OrderType = "limit" | "stop" | "stop_limit" | "trailing_stop";
type Side = "buy" | "sell";
type TIF = "DAY" | "GTC";
type StatusFilter = "working" | "all" | "filled" | "cancelled" | "expired" | "rejected";

interface PaperOrder {
  id: string;
  symbol: string;
  side: Side;
  order_type: string;
  quantity: number;
  limit_price: number | null;
  stop_price: number | null;
  trail_amount: number | null;
  trail_percent: number | null;
  watermark: number | null;
  stop_triggered: boolean;
  time_in_force: string;
  status: string;
  contract_key: string | null;
  filled_price: number | null;
  filled_at: string | null;
  notes: string | null;
  oco_group: string | null;
  parent_order_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PaperTrade {
  id: string;
  symbol: string;
  action: string;
  quantity: number;
  price: number;
  total_value: number;
  profit_loss: number | null;
  notes: string | null;
  executed_at: string;
}

interface Props {
  defaultSymbol?: string;
  onOrderChange?: () => void;
}

// ---- Validation -----------------------------------------------------------
const baseSchema = z.object({
  symbol: z.string().trim().min(1, "Symbol required").max(10, "Symbol too long")
    .regex(/^[A-Z0-9.\-]+$/, "Symbol must be uppercase letters/numbers"),
  side: z.enum(["buy", "sell"]),
  orderType: z.enum(["limit", "stop", "stop_limit", "trailing_stop"]),
  quantity: z.number().positive("Quantity must be > 0").max(100000, "Quantity too large"),
  tif: z.enum(["DAY", "GTC"]),
  limitPrice: z.number().positive().optional().nullable(),
  stopPrice: z.number().positive().optional().nullable(),
  trailAmount: z.number().positive().optional().nullable(),
  trailPercent: z.number().positive().max(100).optional().nullable(),
});

function validateOrder(input: z.infer<typeof baseSchema>): string | null {
  const parsed = baseSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid input";
  const d = parsed.data;
  switch (d.orderType) {
    case "limit":
      if (d.limitPrice == null) return "Limit price required for limit orders";
      if (d.stopPrice != null) return "Limit orders cannot have a stop price";
      break;
    case "stop":
      if (d.stopPrice == null) return "Stop price required for stop orders";
      if (d.limitPrice != null) return "Stop orders cannot have a limit price";
      break;
    case "stop_limit":
      if (d.stopPrice == null || d.limitPrice == null) return "Stop-limit orders require both stop and limit prices";
      if (d.side === "buy" && d.limitPrice < d.stopPrice) return "Buy stop-limit: limit must be >= stop";
      if (d.side === "sell" && d.limitPrice > d.stopPrice) return "Sell stop-limit: limit must be <= stop";
      break;
    case "trailing_stop":
      if (d.trailAmount == null && d.trailPercent == null) return "Trailing stop requires trail $ or trail %";
      if (d.trailAmount != null && d.trailPercent != null) return "Use either trail $ or trail %, not both";
      if (d.limitPrice != null) return "Trailing stop orders cannot have a limit price";
      if (d.stopPrice != null) return "Trailing stop orders set their own stop";
      break;
  }
  return null;
}

// ---- Presets --------------------------------------------------------------
interface OrderPreset {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  isMultiOrder: boolean;
  configure: (symbol: string, priceHint?: number) => Partial<FormState> & { bracket?: BracketParams };
}

interface FormState {
  side: Side;
  orderType: OrderType;
  quantity: string;
  limitPrice: string;
  stopPrice: string;
  trailAmount: string;
  trailPercent: string;
  tif: TIF;
}

interface BracketParams {
  stopLossPrice: string;
  takeProfitPrice: string;
}

function computeBracketPrices(side: Side, entryPrice: number, riskPct: number, rr: number): BracketParams {
  const sl = side === "buy"
    ? entryPrice * (1 - riskPct / 100)
    : entryPrice * (1 + riskPct / 100);
  const risk = Math.abs(entryPrice - sl);
  const tp = side === "buy"
    ? entryPrice + risk * rr
    : entryPrice - risk * rr;
  return {
    stopLossPrice: safeToFixed(sl, 2),
    takeProfitPrice: safeToFixed(tp, 2),
  };
}

const PRESETS: OrderPreset[] = [
  {
    id: "bracket_buy",
    label: "Bracket Buy",
    description: "Limit entry + stop loss + take profit",
    icon: <Target className="h-3.5 w-3.5" />,
    isMultiOrder: true,
    configure: (symbol, priceHint = 100) => {
      const entry = priceHint;
      const qty = Math.max(1, Math.floor(5000 / entry));
      const bracket = computeBracketPrices("buy", entry, 2, 2);
      return {
        side: "buy",
        orderType: "limit" as OrderType,
        quantity: String(qty),
        limitPrice: safeToFixed(entry * 0.995, 2),
        stopPrice: "",
        trailAmount: "",
        trailPercent: "",
        tif: "GTC",
        bracket,
      };
    },
  },
  {
    id: "bracket_sell",
    label: "Bracket Sell",
    description: "Short limit entry + stop + target",
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
    isMultiOrder: true,
    configure: (symbol, priceHint = 100) => {
      const entry = priceHint;
      const qty = Math.max(1, Math.floor(5000 / entry));
      const bracket = computeBracketPrices("sell", entry, 2, 2);
      return {
        side: "sell",
        orderType: "limit" as OrderType,
        quantity: String(qty),
        limitPrice: safeToFixed(entry * 1.005, 2),
        stopPrice: "",
        trailAmount: "",
        trailPercent: "",
        tif: "GTC",
        bracket,
      };
    },
  },
  {
    id: "entry_tp_buy",
    label: "Buy Limit + TP",
    description: "Limit entry with take-profit limit",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    isMultiOrder: true,
    configure: (symbol, priceHint = 100) => {
      const entry = priceHint;
      const qty = Math.max(1, Math.floor(5000 / entry));
      const bracket = computeBracketPrices("buy", entry, 0, 2); // no SL, just TP
      return {
        side: "buy",
        orderType: "limit" as OrderType,
        quantity: String(qty),
        limitPrice: safeToFixed(entry * 0.995, 2),
        stopPrice: "",
        trailAmount: "",
        trailPercent: "",
        tif: "GTC",
        bracket: { stopLossPrice: "", takeProfitPrice: bracket.takeProfitPrice },
      };
    },
  },
  {
    id: "entry_tp_sell",
    label: "Sell Limit + TP",
    description: "Short limit entry with take-profit limit",
    icon: <TrendingDown className="h-3.5 w-3.5" />,
    isMultiOrder: true,
    configure: (symbol, priceHint = 100) => {
      const entry = priceHint;
      const qty = Math.max(1, Math.floor(5000 / entry));
      const bracket = computeBracketPrices("sell", entry, 0, 2);
      return {
        side: "sell",
        orderType: "limit" as OrderType,
        quantity: String(qty),
        limitPrice: safeToFixed(entry * 1.005, 2),
        stopPrice: "",
        trailAmount: "",
        trailPercent: "",
        tif: "GTC",
        bracket: { stopLossPrice: "", takeProfitPrice: bracket.takeProfitPrice },
      };
    },
  },
  {
    id: "buy_stop",
    label: "Buy Stop Entry",
    description: "Stop order above market (breakout)",
    icon: <ArrowUpFromLine className="h-3.5 w-3.5" />,
    isMultiOrder: false,
    configure: (symbol, priceHint = 100) => ({
      side: "buy",
      orderType: "stop" as OrderType,
      quantity: String(Math.max(1, Math.floor(5000 / priceHint))),
      limitPrice: "",
      stopPrice: safeToFixed(priceHint * 1.01, 2),
      trailAmount: "",
      trailPercent: "",
      tif: "DAY",
    }),
  },
  {
    id: "sell_stop",
    label: "Sell Stop Entry",
    description: "Stop order below market (breakdown)",
    icon: <ArrowDownFromLine className="h-3.5 w-3.5" />,
    isMultiOrder: false,
    configure: (symbol, priceHint = 100) => ({
      side: "sell",
      orderType: "stop" as OrderType,
      quantity: String(Math.max(1, Math.floor(5000 / priceHint))),
      limitPrice: "",
      stopPrice: safeToFixed(priceHint * 0.99, 2),
      trailAmount: "",
      trailPercent: "",
      tif: "DAY",
    }),
  },
  {
    id: "trailing_exit",
    label: "Trailing Stop Exit",
    description: "Trailing stop to protect a position",
    icon: <Link2 className="h-3.5 w-3.5" />,
    isMultiOrder: false,
    configure: (symbol, priceHint = 100) => ({
      side: "sell",
      orderType: "trailing_stop" as OrderType,
      quantity: String(Math.max(1, Math.floor(5000 / priceHint))),
      limitPrice: "",
      stopPrice: "",
      trailAmount: "1.00",
      trailPercent: "",
      tif: "GTC",
    }),
  },
];

// ---- Component ------------------------------------------------------------
export const WorkingOrdersPanel = ({ defaultSymbol = "AAPL", onOrderChange }: Props) => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [lastEvalSummary, setLastEvalSummary] = useState<Record<string, number> | null>(null);
  const [detailOrder, setDetailOrder] = useState<PaperOrder | null>(null);
  const [detailFills, setDetailFills] = useState<PaperTrade[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Preset state
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [bracketParams, setBracketParams] = useState<BracketParams | null>(null);
  const [priceHint, setPriceHint] = useState(100);

  // Form state
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [quantity, setQuantity] = useState("1");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [trailAmount, setTrailAmount] = useState("");
  const [trailPercent, setTrailPercent] = useState("");
  const [tif, setTif] = useState<TIF>("DAY");
  const [formError, setFormError] = useState<string | null>(null);

  // Filter state
  const [searchSymbol, setSearchSymbol] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("working");
  const [typeFilter, setTypeFilter] = useState<"all" | OrderType | "market">("all");

  useEffect(() => { setSymbol(defaultSymbol); }, [defaultSymbol]);

  // Fetch a rough price hint for presets
  const fetchPriceHint = useCallback(async (sym: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("fetch-market-data", {
        body: { symbols: [sym.toUpperCase()] },
      });
      if (error) return;
      const q = data?.quotes?.[0];
      if (q?.price) setPriceHint(Number(q.price));
      else if (q?.last) setPriceHint(Number(q.last));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (symbol) fetchPriceHint(symbol);
  }, [symbol, fetchPriceHint]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      let query = supabase.from("paper_orders").select("*").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(200);
      if (statusFilter === "working") {
        query = query.in("status", ["working", "pending_parent"]);
      } else if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      setOrders((data || []) as PaperOrder[]);
    } catch (err: any) {
      toast({ title: "Failed to load orders", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, statusFilter]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Realtime updates
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("paper-orders-changes")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "paper_orders", filter: `user_id=eq.${userId}` },
        () => { loadOrders(); onOrderChange?.(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, loadOrders, onOrderChange]);

  // Filtered view
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (searchSymbol && !o.symbol.toUpperCase().includes(searchSymbol.toUpperCase())) return false;
      if (typeFilter !== "all" && o.order_type !== typeFilter) return false;
      return true;
    });
  }, [orders, searchSymbol, typeFilter]);

  const resetForm = () => {
    setActivePreset(null);
    setBracketParams(null);
    setOrderType("limit");
    setLimitPrice("");
    setStopPrice("");
    setTrailAmount("");
    setTrailPercent("");
    setFormError(null);
  };

  const applyPreset = (preset: OrderPreset) => {
    const cfg = preset.configure(symbol, priceHint);
    setActivePreset(preset.id);
    setSide(cfg.side ?? "buy");
    setOrderType(cfg.orderType ?? "limit");
    setQuantity(cfg.quantity ?? "1");
    setLimitPrice(cfg.limitPrice ?? "");
    setStopPrice(cfg.stopPrice ?? "");
    setTrailAmount(cfg.trailAmount ?? "");
    setTrailPercent(cfg.trailPercent ?? "");
    setTif(cfg.tif ?? "DAY");
    if (cfg.bracket) setBracketParams(cfg.bracket);
    else setBracketParams(null);
    setFormError(null);
  };

  const placeSingleOrder = async () => {
    setFormError(null);
    const input = {
      symbol: symbol.trim().toUpperCase(),
      side,
      orderType,
      quantity: Number(quantity),
      tif,
      limitPrice: limitPrice === "" ? null : Number(limitPrice),
      stopPrice: stopPrice === "" ? null : Number(stopPrice),
      trailAmount: trailAmount === "" ? null : Number(trailAmount),
      trailPercent: trailPercent === "" ? null : Number(trailPercent),
    };
    const err = validateOrder(input);
    if (err) { setFormError(err); return; }

    setPlacing(true);
    try {
      const body: Record<string, any> = {
        symbol: input.symbol, action: input.side, quantity: input.quantity,
        orderType: input.orderType, timeInForce: input.tif, isStock: true,
      };
      if (input.limitPrice != null) body.limitPrice = input.limitPrice;
      if (input.stopPrice != null) body.stopPrice = input.stopPrice;
      if (input.trailAmount != null) body.trailAmount = input.trailAmount;
      if (input.trailPercent != null) body.trailPercent = input.trailPercent;

      const { data, error } = await supabase.functions.invoke("place-paper-order", { body });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Order rejected");

      toast({ title: "Order placed", description: `${input.side.toUpperCase()} ${input.quantity} ${input.symbol} ${input.orderType}` });
      setLimitPrice(""); setStopPrice(""); setTrailAmount(""); setTrailPercent("");
      setActivePreset(null);
      setBracketParams(null);
      await loadOrders();
      onOrderChange?.();
    } catch (err: any) {
      setFormError(err.message);
      toast({ title: "Order failed", description: err.message, variant: "destructive" });
    } finally {
      setPlacing(false);
    }
  };

  const placeBracket = async () => {
    if (!bracketParams) return;
    setFormError(null);
    const sym = symbol.trim().toUpperCase();
    const qty = Number(quantity);
    const input = {
      symbol: sym, side, orderType, quantity: qty, tif,
      limitPrice: limitPrice === "" ? null : Number(limitPrice),
      stopPrice: stopPrice === "" ? null : Number(stopPrice),
      trailAmount: trailAmount === "" ? null : Number(trailAmount),
      trailPercent: trailPercent === "" ? null : Number(trailPercent),
    };
    const err = validateOrder(input);
    if (err) { setFormError(err); return; }

    setPlacing(true);
    try {
      const ocoGroup = crypto.randomUUID();
      const notesBase = activePreset ? `Preset: ${PRESETS.find(p => p.id === activePreset)?.label ?? activePreset}` : "";

      // 1. Entry order (parent)
      const entryBody: Record<string, any> = {
        symbol: sym, action: side, quantity: qty,
        orderType, timeInForce: tif, isStock: true, ocoGroup,
        notes: notesBase,
      };
      if (input.limitPrice != null) entryBody.limitPrice = input.limitPrice;
      if (input.stopPrice != null) entryBody.stopPrice = input.stopPrice;

      const { data: entryRes, error: entryErr } = await supabase.functions.invoke("place-paper-order", { body: entryBody });
      if (entryErr) throw entryErr;
      if (entryRes?.success === false) throw new Error(entryRes.error || "Entry order rejected");
      const parentId = entryRes?.order?.id;
      if (!parentId) throw new Error("Entry order did not return an ID");

      // 2. Stop loss child (if provided)
      if (bracketParams.stopLossPrice && Number(bracketParams.stopLossPrice) > 0) {
        const slSide = side === "buy" ? "sell" : "buy";
        const slBody = {
          symbol: sym, action: slSide, quantity: qty,
          orderType: "stop", timeInForce: "GTC", isStock: true,
          ocoGroup, parentOrderId: parentId, status: "pending_parent",
          stopPrice: Number(bracketParams.stopLossPrice),
          notes: notesBase ? `${notesBase} | Stop Loss` : "Stop Loss",
        };
        const { data: slRes, error: slErr } = await supabase.functions.invoke("place-paper-order", { body: slBody });
        if (slErr) throw slErr;
        if (slRes?.success === false) console.warn("Stop-loss placement warning:", slRes.error);
      }

      // 3. Take profit child (if provided)
      if (bracketParams.takeProfitPrice && Number(bracketParams.takeProfitPrice) > 0) {
        const tpSide = side === "buy" ? "sell" : "buy";
        const tpBody = {
          symbol: sym, action: tpSide, quantity: qty,
          orderType: "limit", timeInForce: "GTC", isStock: true,
          ocoGroup, parentOrderId: parentId, status: "pending_parent",
          limitPrice: Number(bracketParams.takeProfitPrice),
          notes: notesBase ? `${notesBase} | Take Profit` : "Take Profit",
        };
        const { data: tpRes, error: tpErr } = await supabase.functions.invoke("place-paper-order", { body: tpBody });
        if (tpErr) throw tpErr;
        if (tpRes?.success === false) console.warn("Take-profit placement warning:", tpRes.error);
      }

      toast({ title: "Bracket placed", description: `${sym} ${side} ${qty} with OCO group` });
      resetForm();
      await loadOrders();
      onOrderChange?.();
    } catch (err: any) {
      setFormError(err.message);
      toast({ title: "Bracket failed", description: err.message, variant: "destructive" });
    } finally {
      setPlacing(false);
    }
  };

  const cancelOrder = async (id: string) => {
    setCancellingId(id);
    const previous = orders;
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: "cancelled" } : o));
    try {
      const { error } = await supabase
        .from("paper_orders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id)
        .in("status", ["working", "pending_parent"]);
      if (error) throw error;
      toast({ title: "Order cancelled" });
      await loadOrders();
      onOrderChange?.();
    } catch (err: any) {
      setOrders(previous);
      toast({ title: "Cancel failed", description: err.message, variant: "destructive" });
    } finally {
      setCancellingId(null);
    }
  };

  const evaluateNow = async () => {
    setEvaluating(true);
    try {
      const { data, error } = await supabase.functions.invoke("evaluate-paper-orders", { body: {} });
      if (error) throw error;
      const s = data?.summary;
      if (s) setLastEvalSummary(s);
      toast({
        title: "Evaluated working orders",
        description: s ? `Filled ${s.filled} \u00b7 Triggered ${s.triggered} \u00b7 Expired ${s.expired} \u00b7 Cancelled ${s.cancelled}` : "Done",
      });
      await loadOrders();
      onOrderChange?.();
    } catch (err: any) {
      toast({ title: "Evaluate failed", description: err.message, variant: "destructive" });
    } finally {
      setEvaluating(false);
    }
  };

  const openDetails = async (o: PaperOrder) => {
    setDetailOrder(o);
    setDetailFills([]);
    setDetailLoading(true);
    try {
      let q = supabase.from("paper_trades").select("*")
        .eq("symbol", o.symbol)
        .gte("executed_at", o.created_at)
        .order("executed_at", { ascending: false })
        .limit(20);
      const { data } = await q;
      setDetailFills((data || []) as PaperTrade[]);
    } finally {
      setDetailLoading(false);
    }
  };

  const needsLimit = orderType === "limit" || orderType === "stop_limit";
  const needsStop = orderType === "stop" || orderType === "stop_limit";
  const isTrail = orderType === "trailing_stop";
  const isBracketMode = !!activePreset && PRESETS.find(p => p.id === activePreset)?.isMultiOrder;

  const statusBadgeVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
    if (s === "filled") return "default";
    if (s === "working" || s === "pending_parent") return "secondary";
    if (s === "rejected" || s === "cancelled" || s === "expired") return "outline";
    return "outline";
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2">
              Working Orders
              <Badge variant="secondary">SIMULATED</Badge>
            </CardTitle>
            <div className="flex gap-2 items-center">
              {lastEvalSummary && (
                <span className="text-xs text-muted-foreground hidden md:inline">
                  Last eval: filled {lastEvalSummary.filled}, triggered {lastEvalSummary.triggered}, expired {lastEvalSummary.expired}
                </span>
              )}
              <Button size="sm" variant="outline" onClick={loadOrders} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
              <Button size="sm" variant="outline" onClick={evaluateNow} disabled={evaluating}>
                {evaluating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                Evaluate Now
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Presets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase text-muted-foreground">Quick Presets</Label>
              {activePreset && (
                <Button size="sm" variant="ghost" onClick={resetForm} className="h-6 px-2 text-xs">
                  <RotateCcw className="h-3 w-3 mr-1" /> Reset
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  size="sm"
                  variant={activePreset === preset.id ? "default" : "outline"}
                  onClick={() => applyPreset(preset)}
                  className="h-8 text-xs gap-1"
                  title={preset.description}
                >
                  {preset.icon}
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Order entry */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-lg border bg-muted/30">
            <div>
              <Label className="text-xs">Symbol</Label>
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} maxLength={10} />
            </div>
            <div>
              <Label className="text-xs">Side</Label>
              <Select value={side} onValueChange={(v) => setSide(v as Side)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="sell">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Order Type</Label>
              <Select value={orderType} onValueChange={(v) => { setOrderType(v as OrderType); setFormError(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="limit">Limit</SelectItem>
                  <SelectItem value="stop">Stop</SelectItem>
                  <SelectItem value="stop_limit">Stop-Limit</SelectItem>
                  <SelectItem value="trailing_stop">Trailing Stop</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Quantity</Label>
              <Input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            {needsLimit && (
              <div>
                <Label className="text-xs">
                  Limit Price {isBracketMode && bracketParams?.takeProfitPrice && <span className="text-muted-foreground">(entry)</span>}
                </Label>
                <Input type="number" step="0.01" min="0" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} />
              </div>
            )}
            {needsStop && (
              <div>
                <Label className="text-xs">Stop Price</Label>
                <Input type="number" step="0.01" min="0" value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} />
              </div>
            )}
            {isTrail && (
              <>
                <div>
                  <Label className="text-xs">Trail $ <span className="text-muted-foreground">(or %)</span></Label>
                  <Input type="number" step="0.01" min="0" value={trailAmount}
                    onChange={(e) => { setTrailAmount(e.target.value); if (e.target.value) setTrailPercent(""); }} />
                </div>
                <div>
                  <Label className="text-xs">Trail % <span className="text-muted-foreground">(or $)</span></Label>
                  <Input type="number" step="0.1" min="0" max="100" value={trailPercent}
                    onChange={(e) => { setTrailPercent(e.target.value); if (e.target.value) setTrailAmount(""); }} />
                </div>
              </>
            )}
            <div>
              <Label className="text-xs">Time in Force</Label>
              <Select value={tif} onValueChange={(v) => setTif(v as TIF)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAY">DAY</SelectItem>
                  <SelectItem value="GTC">GTC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Bracket params display */}
            {isBracketMode && bracketParams && (
              <>
                {bracketParams.stopLossPrice && (
                  <div>
                    <Label className="text-xs flex items-center gap-1 text-red-500">
                      <ShieldAlert className="h-3 w-3" /> Stop Loss
                    </Label>
                    <div className="h-9 px-3 flex items-center rounded-md border bg-red-500/10 text-red-400 font-mono text-sm">
                      ${bracketParams.stopLossPrice}
                    </div>
                  </div>
                )}
                {bracketParams.takeProfitPrice && (
                  <div>
                    <Label className="text-xs flex items-center gap-1 text-green-500">
                      <Target className="h-3 w-3" /> Take Profit
                    </Label>
                    <div className="h-9 px-3 flex items-center rounded-md border bg-green-500/10 text-green-400 font-mono text-sm">
                      ${bracketParams.takeProfitPrice}
                    </div>
                  </div>
                )}
              </>
            )}

            {formError && (
              <div className="col-span-2 md:col-span-4 text-sm text-destructive">{formError}</div>
            )}
            <div className="col-span-2 md:col-span-4">
              <Button onClick={isBracketMode ? placeBracket : placeSingleOrder} disabled={placing} className="w-full">
                {placing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                {isBracketMode ? "Place Bracket" : "Place Working Order"}
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search symbol..."
                value={searchSymbol} onChange={(e) => setSearchSymbol(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="working">Working (incl. pending)</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="filled">Filled</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
              <SelectTrigger><SelectValue placeholder="Order type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="market">Market</SelectItem>
                <SelectItem value="limit">Limit</SelectItem>
                <SelectItem value="stop">Stop</SelectItem>
                <SelectItem value="stop_limit">Stop-Limit</SelectItem>
                <SelectItem value="trailing_stop">Trailing Stop</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Orders list */}
          <div className="space-y-2">
            {filteredOrders.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">
                {orders.length === 0 ? "No orders." : "No orders match filters."}
              </p>
            ) : (
              filteredOrders.map((o) => {
                const isWorking = o.status === "working" || o.status === "pending_parent";
                const isChild = !!o.parent_order_id;
                return (
                  <div key={o.id} className="flex items-center justify-between p-3 rounded-lg border bg-card gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{o.symbol}</span>
                        <Badge variant={o.side === "buy" ? "default" : "destructive"} className="uppercase">{o.side}</Badge>
                        <Badge variant="outline" className="uppercase">{o.order_type.replace("_", " ")}</Badge>
                        <Badge variant="secondary">{o.time_in_force}</Badge>
                        <Badge variant={statusBadgeVariant(o.status)} className="uppercase">{o.status.replace("_", " ")}</Badge>
                        {o.oco_group && <Badge variant="outline" className="text-xs"><Link2 className="h-3 w-3 mr-1" />OCO</Badge>}
                        {isChild && <Badge variant="outline" className="text-xs">Child</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Qty {Number(o.quantity)}
                        {o.limit_price != null && ` \u00b7 Limit $${safeToFixed(o.limit_price, 2)}`}
                        {o.stop_price != null && ` \u00b7 Stop $${safeToFixed(o.stop_price, 2)}`}
                        {o.trail_amount != null && ` \u00b7 Trail $${safeToFixed(o.trail_amount, 2)}`}
                        {o.trail_percent != null && ` \u00b7 Trail ${safeToFixed(o.trail_percent, 2)}%`}
                        {o.filled_price != null && ` \u00b7 Filled @ $${safeToFixed(o.filled_price, 2)}`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Placed {new Date(o.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openDetails(o)}>
                        <Eye className="h-4 w-4 mr-1" /> Details
                      </Button>
                      {isWorking && (
                        <Button variant="ghost" size="sm" onClick={() => cancelOrder(o.id)} disabled={cancellingId === o.id}>
                          {cancellingId === o.id
                            ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            : <X className="h-4 w-4 mr-1" />}
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Details drawer */}
      <Sheet open={!!detailOrder} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {detailOrder && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {detailOrder.symbol}
                  <Badge variant={detailOrder.side === "buy" ? "default" : "destructive"} className="uppercase">{detailOrder.side}</Badge>
                  <Badge variant={statusBadgeVariant(detailOrder.status)} className="uppercase">
                    {detailOrder.status.replace("_", " ")}
                  </Badge>
                </SheetTitle>
                <SheetDescription>Order details and fills</SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4 text-sm">
                <DetailRow label="Order Type" value={detailOrder.order_type.replace("_", " ").toUpperCase()} />
                <DetailRow label="Quantity" value={String(detailOrder.quantity)} />
                <DetailRow label="Time in Force" value={detailOrder.time_in_force} />
                {detailOrder.contract_key && <DetailRow label="Contract" value={detailOrder.contract_key} />}
                {detailOrder.oco_group && <DetailRow label="OCO Group" value={detailOrder.oco_group.slice(0, 8) + "..."} />}
                {detailOrder.parent_order_id && <DetailRow label="Parent" value={detailOrder.parent_order_id.slice(0, 8) + "..."} />}

                <Separator />
                <div className="font-medium text-xs uppercase text-muted-foreground">Parameters</div>
                {detailOrder.limit_price != null && <DetailRow label="Limit Price" value={`$${safeToFixed(detailOrder.limit_price, 2)}`} />}
                {detailOrder.stop_price != null && (
                  <DetailRow label="Stop Price"
                    value={`$${safeToFixed(detailOrder.stop_price, 2)}${detailOrder.stop_triggered ? " (triggered)" : ""}`} />
                )}
                {detailOrder.trail_amount != null && <DetailRow label="Trail $" value={`$${safeToFixed(detailOrder.trail_amount, 2)}`} />}
                {detailOrder.trail_percent != null && <DetailRow label="Trail %" value={`${safeToFixed(detailOrder.trail_percent, 2)}%`} />}
                {detailOrder.watermark != null && <DetailRow label="Watermark" value={`$${safeToFixed(detailOrder.watermark, 2)}`} />}

                <Separator />
                <div className="font-medium text-xs uppercase text-muted-foreground">Timestamps</div>
                <DetailRow label="Placed" value={new Date(detailOrder.created_at).toLocaleString()} />
                <DetailRow label="Last update" value={new Date(detailOrder.updated_at).toLocaleString()} />
                {detailOrder.filled_at && (
                  <DetailRow label="Filled" value={`${new Date(detailOrder.filled_at).toLocaleString()} @ $${safeToFixed(detailOrder.filled_price, 2)}`} />
                )}

                {detailOrder.notes && (
                  <>
                    <Separator />
                    <div className="font-medium text-xs uppercase text-muted-foreground">Notes</div>
                    <p className="text-sm">{detailOrder.notes}</p>
                  </>
                )}

                <Separator />
                <div className="font-medium text-xs uppercase text-muted-foreground">Fills (this symbol since order)</div>
                {detailLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading fills...
                  </div>
                ) : detailFills.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No fills recorded for this symbol after the order was placed.</p>
                ) : (
                  <div className="space-y-2">
                    {detailFills.map((t) => (
                      <div key={t.id} className="text-xs p-2 rounded border bg-muted/40">
                        <div className="flex justify-between">
                          <span className="font-medium uppercase">{t.action} {Number(t.quantity)} @ ${safeToFixed(t.price, 2)}</span>
                          {t.profit_loss != null && (
                            <span className={Number(t.profit_loss) >= 0 ? "text-green-500" : "text-red-500"}>
                              {Number(t.profit_loss) >= 0 ? "+" : ""}${safeToFixed(t.profit_loss, 2)}
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground">{new Date(t.executed_at).toLocaleString()}</div>
                        {t.notes && <div className="text-muted-foreground">{t.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {(detailOrder.status === "working" || detailOrder.status === "pending_parent") && (
                  <>
                    <Separator />
                    <Button variant="destructive" className="w-full" disabled={cancellingId === detailOrder.id}
                      onClick={async () => { await cancelOrder(detailOrder.id); setDetailOrder(null); }}>
                      {cancellingId === detailOrder.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <X className="h-4 w-4 mr-2" />}
                      Cancel Order
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-right break-all">{value}</span>
  </div>
);

export default WorkingOrdersPanel;
