import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PaperPosition {
  symbol: string;
  contractKey: string | null;
  quantity: number;
  avgCost: number;
  multiplier: number;
  mark: number;
  marketValue: number;
  unrealizedPnl: number;
  markSource: string;
}

interface Portfolio {
  cash: number;
  startingBalance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  equity: number;
  buyingPower: number;
  positions: PaperPosition[];
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const pnlClass = (n: number) =>
  n > 0 ? "text-green-500" : n < 0 ? "text-red-500" : "text-muted-foreground";

interface Props {
  /** Bump this value after a trade to trigger a refresh. */
  refreshKey?: number;
}

export function PaperPortfolioPanel({ refreshKey = 0 }: Props) {
  const [data, setData] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke("paper-portfolio");
      if (err) throw err;
      setData(res as Portfolio);
    } catch (e: any) {
      setError(e?.message || "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000); // refresh marks every 30s
    return () => clearInterval(id);
  }, [load, refreshKey]);

  const totalPnl = data ? data.realizedPnl + data.unrealizedPnl : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wallet className="h-5 w-5" />
          Paper Account
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-red-500">{error}</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Equity" value={fmt(data.equity)} />
              <Stat label="Cash" value={fmt(data.cash)} />
              <Stat label="Buying Power" value={fmt(data.buyingPower)} />
              <Stat
                label="Total P&L"
                value={`${totalPnl >= 0 ? "+" : ""}${fmt(totalPnl)}`}
                className={pnlClass(totalPnl)}
              />
            </div>
            <div className="flex gap-6 text-sm">
              <span className="text-muted-foreground">
                Realized:{" "}
                <span className={pnlClass(data.realizedPnl)}>
                  {data.realizedPnl >= 0 ? "+" : ""}{fmt(data.realizedPnl)}
                </span>
              </span>
              <span className="text-muted-foreground">
                Unrealized:{" "}
                <span className={pnlClass(data.unrealizedPnl)}>
                  {data.unrealizedPnl >= 0 ? "+" : ""}{fmt(data.unrealizedPnl)}
                </span>
              </span>
            </div>

            {data.positions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No open positions. Place a paper trade to get started.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">Symbol</th>
                      <th className="py-2 px-2 font-medium text-right">Qty</th>
                      <th className="py-2 px-2 font-medium text-right">Avg Cost</th>
                      <th className="py-2 px-2 font-medium text-right">Mark</th>
                      <th className="py-2 px-2 font-medium text-right">Mkt Value</th>
                      <th className="py-2 pl-2 font-medium text-right">Unrealized</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.positions.map((p) => {
                      const isShort = p.quantity < 0;
                      return (
                        <tr key={`${p.symbol}-${p.contractKey ?? "stock"}`} className="border-b border-border/50">
                          <td className="py-2 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{p.symbol}</span>
                              <Badge variant={isShort ? "destructive" : "secondary"} className="text-[10px]">
                                {isShort ? "SHORT" : "LONG"}
                              </Badge>
                              {p.contractKey && (
                                <span className="text-xs text-muted-foreground">{p.contractKey}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right">{Math.abs(p.quantity)}</td>
                          <td className="py-2 px-2 text-right">{fmt(p.avgCost)}</td>
                          <td className="py-2 px-2 text-right">{fmt(p.mark)}</td>
                          <td className="py-2 px-2 text-right">{fmt(p.marketValue)}</td>
                          <td className={`py-2 pl-2 text-right ${pnlClass(p.unrealizedPnl)}`}>
                            <span className="inline-flex items-center justify-end gap-1">
                              {p.unrealizedPnl > 0 ? <TrendingUp className="h-3 w-3" /> : p.unrealizedPnl < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                              {p.unrealizedPnl >= 0 ? "+" : ""}{fmt(p.unrealizedPnl)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted-foreground">
                  Marks from live quotes; options shown at cost until live option marking ships.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-base font-semibold ${className ?? ""}`}>{value}</p>
    </div>
  );
}
