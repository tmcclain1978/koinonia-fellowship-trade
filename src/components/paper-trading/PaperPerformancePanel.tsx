import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, TrendingUp, TrendingDown, LineChart as LineChartIcon, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface PaperTrade {
  id: string;
  symbol: string;
  action: "buy" | "sell";
  quantity: number;
  price: number;
  total_value: number;
  profit_loss: number | null;
  executed_at: string;
  notes: string | null;
}

interface PortfolioResp {
  cash: number;
  startingBalance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  equity: number;
  positions: Array<{
    symbol: string;
    contractKey: string | null;
    quantity: number;
    marketValue: number;
    unrealizedPnl: number;
  }>;
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const pnlClass = (n: number) =>
  n > 0 ? "text-green-500" : n < 0 ? "text-red-500" : "text-muted-foreground";

interface Props {
  refreshKey?: number;
}

export function PaperPerformancePanel({ refreshKey = 0 }: Props) {
  const { toast } = useToast();
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioResp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: tradeRows, error: tradeErr }, { data: pf, error: pfErr }] = await Promise.all([
        supabase
          .from("paper_trades")
          .select("*")
          .order("executed_at", { ascending: true }),
        supabase.functions.invoke("paper-portfolio"),
      ]);
      if (tradeErr) throw tradeErr;
      if (pfErr) throw pfErr;
      setTrades((tradeRows as PaperTrade[]) || []);
      setPortfolio(pf as PortfolioResp);
    } catch (e: any) {
      toast({ title: "Couldn't load performance", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load, refreshKey]);

  // Equity curve: starting balance + running cash flow from trades + current unrealized.
  const equityCurve = useMemo(() => {
    if (!portfolio) return [];
    const start = portfolio.startingBalance || 100000;
    let cash = start;
    const series: Array<{ t: number; label: string; cash: number }> = [
      { t: 0, label: "Start", cash: start },
    ];
    trades.forEach((t) => {
      // buys reduce cash, sells/credits increase cash; total_value is signed by convention here
      const delta = t.action === "buy" ? -Number(t.total_value) : Number(t.total_value);
      cash += delta;
      series.push({
        t: new Date(t.executed_at).getTime(),
        label: new Date(t.executed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        cash,
      });
    });
    // Append current equity point (cash + unrealized) so the line shows live value
    series.push({
      t: Date.now(),
      label: "Now",
      cash: portfolio.equity,
    });
    return series;
  }, [trades, portfolio]);

  // Round-trip stats from closed legs (profit_loss !== null)
  const stats = useMemo(() => {
    const closed = trades.filter((t) => t.profit_loss != null);
    const wins = closed.filter((t) => Number(t.profit_loss) > 0);
    const losses = closed.filter((t) => Number(t.profit_loss) < 0);
    const grossWin = wins.reduce((s, t) => s + Number(t.profit_loss), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.profit_loss), 0));
    return {
      total: closed.length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
      avgWin: wins.length ? grossWin / wins.length : 0,
      avgLoss: losses.length ? grossLoss / losses.length : 0,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    };
  }, [trades]);

  // Per-symbol realized (from closed trades) + unrealized (from current positions)
  const perSymbol = useMemo(() => {
    const map = new Map<string, { symbol: string; realized: number; unrealized: number; holding: number }>();
    trades.forEach((t) => {
      if (t.profit_loss == null) return;
      const k = t.symbol;
      const e = map.get(k) || { symbol: k, realized: 0, unrealized: 0, holding: 0 };
      e.realized += Number(t.profit_loss);
      map.set(k, e);
    });
    (portfolio?.positions || []).forEach((p) => {
      const e = map.get(p.symbol) || { symbol: p.symbol, realized: 0, unrealized: 0, holding: 0 };
      e.unrealized += Number(p.unrealizedPnl);
      e.holding += Number(p.marketValue);
      map.set(p.symbol, e);
    });
    return Array.from(map.values())
      .map((e) => ({ ...e, total: e.realized + e.unrealized }))
      .sort((a, b) => b.total - a.total);
  }, [trades, portfolio]);

  const holdingsValue = (portfolio?.positions || []).reduce((s, p) => s + Number(p.marketValue), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <LineChartIcon className="h-5 w-5" />
          Paper Performance
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryStat label="Cash" value={fmt(portfolio?.cash ?? 0)} />
          <SummaryStat label="Holdings" value={fmt(holdingsValue)} />
          <SummaryStat label="Realized P&L" value={fmt(portfolio?.realizedPnl ?? 0)} valueClass={pnlClass(portfolio?.realizedPnl ?? 0)} />
          <SummaryStat label="Unrealized P&L" value={fmt(portfolio?.unrealizedPnl ?? 0)} valueClass={pnlClass(portfolio?.unrealizedPnl ?? 0)} />
        </div>

        {/* Equity curve */}
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Equity curve</p>
          {equityCurve.length <= 2 ? (
            <p className="rounded border border-dashed py-6 text-center text-xs text-muted-foreground">
              Equity history will appear here once you have executed trades.
            </p>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityCurve} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                  <Tooltip
                    formatter={(v: any) => fmt(Number(v))}
                    labelFormatter={(l) => `${l}`}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="cash" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Trade stats */}
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <BarChart3 className="h-4 w-4" /> Round-trip stats
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <SummaryStat label="Closed" value={String(stats.total)} />
            <SummaryStat label="Win rate" value={`${stats.winRate.toFixed(1)}%`} />
            <SummaryStat label="Avg win" value={fmt(stats.avgWin)} valueClass="text-green-500" />
            <SummaryStat label="Avg loss" value={fmt(stats.avgLoss)} valueClass="text-red-500" />
            <SummaryStat
              label="Profit factor"
              value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}
            />
          </div>
        </div>

        {/* Per-symbol breakdown */}
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">By symbol</p>
          {perSymbol.length === 0 ? (
            <p className="rounded border border-dashed py-4 text-center text-xs text-muted-foreground">
              No closed trades or open positions yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Symbol</th>
                    <th className="py-2 px-2 font-medium text-right">Holding value</th>
                    <th className="py-2 px-2 font-medium text-right">Realized</th>
                    <th className="py-2 px-2 font-medium text-right">Unrealized</th>
                    <th className="py-2 pl-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {perSymbol.map((r) => (
                    <tr key={r.symbol} className="border-b border-border/50">
                      <td className="py-2 pr-2 font-medium">{r.symbol}</td>
                      <td className="py-2 px-2 text-right">{fmt(r.holding)}</td>
                      <td className={`py-2 px-2 text-right ${pnlClass(r.realized)}`}>{fmt(r.realized)}</td>
                      <td className={`py-2 px-2 text-right ${pnlClass(r.unrealized)}`}>{fmt(r.unrealized)}</td>
                      <td className={`py-2 pl-2 text-right font-medium ${pnlClass(r.total)}`}>
                        {r.total >= 0 ? <TrendingUp className="mr-1 inline h-3 w-3" /> : <TrendingDown className="mr-1 inline h-3 w-3" />}
                        {fmt(r.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Equity = cash + live mark-to-market value of all positions. Refreshes every 30s.
        </p>
      </CardContent>
    </Card>
  );
}

function SummaryStat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded border bg-muted/30 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-base font-semibold ${valueClass || ""}`}>{value}</p>
    </div>
  );
}
