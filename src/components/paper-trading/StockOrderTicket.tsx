import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type OrderType = "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT" | "TRAILING_STOP";

interface Props {
  onPlaced?: () => void;
}

export function StockOrderTicket({ onPlaced }: Props) {
  const { toast } = useToast();
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("1");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [trailAmount, setTrailAmount] = useState("");
  const [trailPercent, setTrailPercent] = useState("");
  const [tif, setTif] = useState<"DAY" | "GTC">("DAY");
  const [submitting, setSubmitting] = useState(false);

  const showLimit = orderType === "LIMIT" || orderType === "STOP_LIMIT";
  const showStop = orderType === "STOP" || orderType === "STOP_LIMIT";
  const showTrail = orderType === "TRAILING_STOP";

  const submit = async () => {
    const sym = symbol.trim().toUpperCase();
    const qty = Number(quantity);
    if (!sym) return toast({ title: "Enter a symbol", variant: "destructive" });
    if (!(qty > 0)) return toast({ title: "Quantity must be positive", variant: "destructive" });
    if (showLimit && !(Number(limitPrice) > 0)) return toast({ title: "Enter a limit price", variant: "destructive" });
    if (showStop && !(Number(stopPrice) > 0)) return toast({ title: "Enter a stop price", variant: "destructive" });
    if (showTrail && !(Number(trailAmount) > 0) && !(Number(trailPercent) > 0))
      return toast({ title: "Enter a trail amount or percent", variant: "destructive" });

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("place-paper-order", {
        body: {
          symbol: sym,
          action: side,
          quantity: qty,
          isStock: true,
          orderType,
          limitPrice: showLimit ? Number(limitPrice) : undefined,
          stopPrice: showStop ? Number(stopPrice) : undefined,
          trailAmount: showTrail && trailAmount ? Number(trailAmount) : undefined,
          trailPercent: showTrail && trailPercent ? Number(trailPercent) : undefined,
          timeInForce: tif,
        },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || "Order rejected");

      if (data?.status === "filled") {
        toast({ title: "Order filled", description: `${side.toUpperCase()} ${qty} ${sym} @ $${Number(data.fillPrice).toFixed(2)}` });
      } else {
        toast({ title: "Working order placed", description: `${side.toUpperCase()} ${qty} ${sym} (${orderType.replace("_", " ").toLowerCase()}) resting until triggered.` });
      }
      setLimitPrice(""); setStopPrice(""); setTrailAmount(""); setTrailPercent("");
      onPlaced?.();
    } catch (e: any) {
      toast({ title: "Order error", description: e?.message || "Failed to place order", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5" />
          Stock Order
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Symbol</Label>
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="AAPL" />
          </div>
          <div className="space-y-1">
            <Label>Quantity</Label>
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Side</Label>
            <Select value={side} onValueChange={(v) => setSide(v as "buy" | "sell")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="buy">Buy</SelectItem>
                <SelectItem value="sell">Sell / Short</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Order Type</Label>
            <Select value={orderType} onValueChange={(v) => setOrderType(v as OrderType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKET">Market</SelectItem>
                <SelectItem value="LIMIT">Limit</SelectItem>
                <SelectItem value="STOP">Stop</SelectItem>
                <SelectItem value="STOP_LIMIT">Stop-Limit</SelectItem>
                <SelectItem value="TRAILING_STOP">Trailing Stop</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {(showLimit || showStop) && (
          <div className="grid grid-cols-2 gap-3">
            {showLimit && (
              <div className="space-y-1">
                <Label>Limit Price</Label>
                <Input type="number" step="0.01" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} />
              </div>
            )}
            {showStop && (
              <div className="space-y-1">
                <Label>Stop Price</Label>
                <Input type="number" step="0.01" value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {showTrail && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Trail Amount ($)</Label>
              <Input type="number" step="0.01" value={trailAmount} onChange={(e) => { setTrailAmount(e.target.value); setTrailPercent(""); }} />
            </div>
            <div className="space-y-1">
              <Label>or Trail Percent (%)</Label>
              <Input type="number" step="0.1" value={trailPercent} onChange={(e) => { setTrailPercent(e.target.value); setTrailAmount(""); }} />
            </div>
          </div>
        )}

        {orderType !== "MARKET" && (
          <div className="space-y-1">
            <Label>Time in Force</Label>
            <Select value={tif} onValueChange={(v) => setTif(v as "DAY" | "GTC")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DAY">Day</SelectItem>
                <SelectItem value="GTC">GTC</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <Button className="w-full" onClick={submit} disabled={submitting}>
          {submitting ? "Placing…" : orderType === "MARKET" ? "Place Market Order" : "Place Working Order"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Market orders fill now from a live quote. Limit/stop/trailing orders rest until triggered and are checked every minute.
        </p>
      </CardContent>
    </Card>
  );
}
