import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, RefreshCw, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface OrderEvent {
  id: string;
  order_id: string;
  parent_order_id: string | null;
  oco_group: string | null;
  event_type: string;
  previous_status: string | null;
  new_status: string;
  fill_price: number | null;
  fill_quantity: number | null;
  reason: string | null;
  metadata: any;
  created_at: string;
}

const statusVariant = (s: string) => {
  switch (s) {
    case "filled": return "default";
    case "cancelled":
    case "rejected": return "destructive";
    case "working": return "secondary";
    case "pending_parent": return "outline";
    default: return "outline";
  }
};

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

interface Props {
  refreshKey?: number;
  limit?: number;
}

export function OrderActivityTimeline({ refreshKey = 0, limit = 100 }: Props) {
  const { toast } = useToast();
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("paper_order_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      setEvents((data as OrderEvent[]) || []);
    } catch (e: any) {
      toast({ title: "Couldn't load order activity", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [limit, toast]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Realtime subscription so transitions show up immediately when the evaluator fills/cancels orders.
  useEffect(() => {
    const channel = supabase
      .channel("paper-order-events-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "paper_order_events" }, (payload) => {
        setEvents((prev) => [payload.new as OrderEvent, ...prev].slice(0, limit));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [limit]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5" />
          Order Activity
          {events.length > 0 && <Badge variant="secondary">{events.length}</Badge>}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No order activity yet. Status changes (created, working, filled, cancelled) will appear here.
          </p>
        ) : (
          <ScrollArea className="h-[420px] pr-2">
            <ol className="relative space-y-3 border-l border-border pl-4">
              {events.map((e) => {
                const meta = e.metadata || {};
                const sym = meta.symbol || "—";
                const side = meta.side as string | undefined;
                const orderType = meta.order_type as string | undefined;
                return (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{sym}</span>
                      {side && (
                        <Badge variant={side === "buy" ? "secondary" : "destructive"} className="text-[10px] uppercase">
                          {side}
                        </Badge>
                      )}
                      {orderType && <span className="text-xs text-muted-foreground">{orderType}</span>}
                      <Badge variant={statusVariant(e.new_status) as any} className="text-[10px]">
                        {e.previous_status ? `${e.previous_status} → ${e.new_status}` : e.new_status}
                      </Badge>
                      {e.parent_order_id && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Link2 className="h-3 w-3" /> child
                        </span>
                      )}
                      {e.oco_group && (
                        <span className="text-[10px] text-muted-foreground">OCO</span>
                      )}
                    </div>
                    {e.fill_price != null && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Filled {e.fill_quantity ?? "?"} @ ${Number(e.fill_price).toFixed(2)}
                      </p>
                    )}
                    {meta.contract_key && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{meta.contract_key}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {fmtTime(e.created_at)} · order {e.order_id.slice(0, 8)}
                    </p>
                  </li>
                );
              })}
            </ol>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
