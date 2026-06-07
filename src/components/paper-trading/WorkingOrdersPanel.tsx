import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, X, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PaperOrder {
  id: string;
  symbol: string;
  contract_key: string | null;
  side: "buy" | "sell";
  order_type: string;
  quantity: number;
  limit_price: number | null;
  stop_price: number | null;
  trail_amount: number | null;
  trail_percent: number | null;
  time_in_force: string;
  status: string;
  created_at: string;
}

const typeLabel: Record<string, string> = {
  limit: "Limit", stop: "Stop", stop_limit: "Stop-Limit", trailing_stop: "Trailing", market: "Market",
};
const num = (n: number | null) => (n == null ? "—" : `$${Number(n).toFixed(2)}`);

interface Props {
  refreshKey?: number;
  onChange?: () => void;
}

export function WorkingOrdersPanel({ refreshKey = 0, onChange }: Props) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("paper_orders")
        .select("*")
        .in("status", ["working", "pending_parent"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      setOrders((data as PaperOrder[]) || []);
    } catch (e: any) {
      toast({ title: "Couldn't load working orders", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load, refreshKey]);

  const cancel = async (id: string) => {
    try {
      const { error } = await supabase
        .from("paper_orders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Order cancelled" });
      await load();
      onChange?.();
    } catch (e: any) {
      toast({ title: "Couldn't cancel", description: e?.message, variant: "destructive" });
    }
  };

  // Force an evaluation pass (otherwise the cron handles it every minute)
  const checkNow = async () => {
    setChecking(true);
    try {
      const { error } = await supabase.functions.invoke("evaluate-paper-orders");
      if (error) throw error;
      toast({ title: "Checked working orders" });
      await load();
      onChange?.();
    } catch (e: any) {
      toast({ title: "Check failed", description: e?.message, variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ListChecks className="h-5 w-5" />
          Working Orders
          {orders.length > 0 && <Badge variant="secondary">{orders.length}</Badge>}
        </CardTitle>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={checkNow} disabled={checking}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            Check now
          </Button>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No resting orders. Place a limit, stop, stop-limit, or trailing order and it will show here until it triggers.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">Symbol</th>
                  <th className="py-2 px-2 font-medium">Side</th>
                  <th className="py-2 px-2 font-medium">Type</th>
                  <th className="py-2 px-2 font-medium text-right">Qty</th>
                  <th className="py-2 px-2 font-medium text-right">Limit</th>
                  <th className="py-2 px-2 font-medium text-right">Stop</th>
                  <th className="py-2 px-2 font-medium">TIF</th>
                  <th className="py-2 pl-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-border/50">
                    <td className="py-2 pr-2">
                      <span className="font-medium">{o.symbol}</span>
                      {o.contract_key && <span className="ml-1 text-xs text-muted-foreground">{o.contract_key}</span>}
                      {o.status === "pending_parent" && (
                        <Badge variant="outline" className="ml-2 text-[10px]">pending</Badge>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <Badge variant={o.side === "buy" ? "secondary" : "destructive"} className="text-[10px] uppercase">
                        {o.side}
                      </Badge>
                    </td>
                    <td className="py-2 px-2">
                      {typeLabel[o.order_type] ?? o.order_type}
                      {o.order_type === "trailing_stop" && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          {o.trail_amount ? `$${o.trail_amount}` : o.trail_percent ? `${o.trail_percent}%` : ""}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">{o.quantity}</td>
                    <td className="py-2 px-2 text-right">{num(o.limit_price)}</td>
                    <td className="py-2 px-2 text-right">{num(o.stop_price)}</td>
                    <td className="py-2 px-2">{o.time_in_force}</td>
                    <td className="py-2 pl-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => cancel(o.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
