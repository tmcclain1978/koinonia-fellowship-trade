import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, X, Plus, Play } from "lucide-react";
import { safeToFixed } from "@/lib/safeNumber";

type OrderType = "limit" | "stop" | "stop_limit" | "trailing_stop";
type Side = "buy" | "sell";
type TIF = "DAY" | "GTC";

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
  time_in_force: string;
  status: string;
  contract_key: string | null;
  filled_price: number | null;
  filled_at: string | null;
  created_at: string;
}

interface Props {
  defaultSymbol?: string;
  onOrderChange?: () => void;
}

export const WorkingOrdersPanel = ({ defaultSymbol = "AAPL", onOrderChange }: Props) => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

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

  useEffect(() => { setSymbol(defaultSymbol); }, [defaultSymbol]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data, error } = await supabase
        .from("paper_orders")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["working", "pending_parent"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      setOrders((data || []) as PaperOrder[]);
    } catch (err: any) {
      toast({ title: "Failed to load working orders", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Realtime updates so fills/cancels appear instantly
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("paper-orders-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "paper_orders", filter: `user_id=eq.${userId}` },
        () => { loadOrders(); onOrderChange?.(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, loadOrders, onOrderChange]);

  const placeOrder = async () => {
    if (!symbol || !quantity) {
      toast({ title: "Missing fields", description: "Symbol and quantity required", variant: "destructive" });
      return;
    }
    setPlacing(true);
    try {
      const body: Record<string, any> = {
        symbol: symbol.toUpperCase(),
        action: side,
        quantity: Number(quantity),
        orderType,
        timeInForce: tif,
        isStock: true,
      };
      if (orderType === "limit" || orderType === "stop_limit") body.limitPrice = Number(limitPrice);
      if (orderType === "stop" || orderType === "stop_limit") body.stopPrice = Number(stopPrice);
      if (orderType === "trailing_stop") {
        if (trailAmount) body.trailAmount = Number(trailAmount);
        if (trailPercent) body.trailPercent = Number(trailPercent);
      }

      const { data, error } = await supabase.functions.invoke("place-paper-order", { body });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Order rejected");

      toast({ title: "Order placed", description: `${side.toUpperCase()} ${quantity} ${symbol} ${orderType}` });
      setLimitPrice(""); setStopPrice(""); setTrailAmount(""); setTrailPercent("");
      await loadOrders();
      onOrderChange?.();
    } catch (err: any) {
      toast({ title: "Order failed", description: err.message, variant: "destructive" });
    } finally {
      setPlacing(false);
    }
  };

  const cancelOrder = async (id: string) => {
    try {
      const { error } = await supabase
        .from("paper_orders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Order cancelled" });
      await loadOrders();
      onOrderChange?.();
    } catch (err: any) {
      toast({ title: "Cancel failed", description: err.message, variant: "destructive" });
    }
  };

  const evaluateNow = async () => {
    setEvaluating(true);
    try {
      const { data, error } = await supabase.functions.invoke("evaluate-paper-orders", { body: {} });
      if (error) throw error;
      const s = data?.summary;
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

  const needsLimit = orderType === "limit" || orderType === "stop_limit";
  const needsStop = orderType === "stop" || orderType === "stop_limit";
  const isTrail = orderType === "trailing_stop";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            Working Orders
            <Badge variant="secondary">SIMULATED</Badge>
          </CardTitle>
          <div className="flex gap-2">
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
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
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
            <Select value={orderType} onValueChange={(v) => setOrderType(v as OrderType)}>
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
            <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          {needsLimit && (
            <div>
              <Label className="text-xs">Limit Price</Label>
              <Input type="number" step="0.01" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} />
            </div>
          )}
          {needsStop && (
            <div>
              <Label className="text-xs">Stop Price</Label>
              <Input type="number" step="0.01" value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} />
            </div>
          )}
          {isTrail && (
            <>
              <div>
                <Label className="text-xs">Trail $</Label>
                <Input type="number" step="0.01" value={trailAmount} onChange={(e) => setTrailAmount(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Trail %</Label>
                <Input type="number" step="0.1" value={trailPercent} onChange={(e) => setTrailPercent(e.target.value)} />
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
          <div className="col-span-2 md:col-span-4">
            <Button onClick={placeOrder} disabled={placing} className="w-full">
              {placing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Place Working Order
            </Button>
          </div>
        </div>

        {/* Working orders list */}
        <div className="space-y-2">
          {orders.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">No working orders.</p>
          ) : (
            orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{o.symbol}</span>
                    <Badge variant={o.side === "buy" ? "default" : "destructive"} className="uppercase">{o.side}</Badge>
                    <Badge variant="outline" className="uppercase">{o.order_type.replace("_", " ")}</Badge>
                    <Badge variant="secondary">{o.time_in_force}</Badge>
                    {o.status === "pending_parent" && <Badge variant="outline">Pending parent</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Qty {Number(o.quantity)}
                    {o.limit_price != null && ` · Limit $${safeToFixed(o.limit_price, 2)}`}
                    {o.stop_price != null && ` · Stop $${safeToFixed(o.stop_price, 2)}`}
                    {o.trail_amount != null && ` · Trail $${safeToFixed(o.trail_amount, 2)}`}
                    {o.trail_percent != null && ` · Trail ${safeToFixed(o.trail_percent, 2)}%`}
                    {o.contract_key && ` · ${o.contract_key}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Placed {new Date(o.created_at).toLocaleString()}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => cancelOrder(o.id)}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkingOrdersPanel;
