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
import { Loader2, RefreshCw, X, Plus, Play, Eye, Search } from "lucide-react";
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

  const placeOrder = async () => {
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
      await loadOrders();
      onOrderChange?.();
    } catch (err: any) {
      setFormError(err.message);
      toast({ title: "Order failed", description: err.message, variant: "destructive" });
    } finally {
      setPlacing(false);
    }
  };

  const cancelOrder = async (id: string) => {
    setCancellingId(id);
    // Optimistic remove from visible list
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
        description: s ? `Filled ${s.filled} · Triggered ${s.triggered} · Expired ${s.expired} · Cancelled ${s.cancelled}` : "Done",
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
      // Fetch fills for this symbol/contract around/after the order was placed
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
                <Label className="text-xs">Limit Price</Label>
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
            {formError && (
              <div className="col-span-2 md:col-span-4 text-sm text-destructive">{formError}</div>
            )}
            <div className="col-span-2 md:col-span-4">
              <Button onClick={placeOrder} disabled={placing} className="w-full">
                {placing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Place Working Order
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
                return (
                  <div key={o.id} className="flex items-center justify-between p-3 rounded-lg border bg-card gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{o.symbol}</span>
                        <Badge variant={o.side === "buy" ? "default" : "destructive"} className="uppercase">{o.side}</Badge>
                        <Badge variant="outline" className="uppercase">{o.order_type.replace("_", " ")}</Badge>
                        <Badge variant="secondary">{o.time_in_force}</Badge>
                        <Badge variant={statusBadgeVariant(o.status)} className="uppercase">{o.status.replace("_", " ")}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Qty {Number(o.quantity)}
                        {o.limit_price != null && ` · Limit $${safeToFixed(o.limit_price, 2)}`}
                        {o.stop_price != null && ` · Stop $${safeToFixed(o.stop_price, 2)}`}
                        {o.trail_amount != null && ` · Trail $${safeToFixed(o.trail_amount, 2)}`}
                        {o.trail_percent != null && ` · Trail ${safeToFixed(o.trail_percent, 2)}%`}
                        {o.filled_price != null && ` · Filled @ $${safeToFixed(o.filled_price, 2)}`}
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
