import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { alignReturns, dailyReturns, loadBars } from "@/lib/marketData/history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell 
} from "recharts";
import { 
  TrendingUp, TrendingDown, Activity, Target, Shield, 
  BarChart3, Calendar, RefreshCw 
} from "lucide-react";
import { 
  calculateAllMetrics, 
  generateMonthlyReturns,
  calculateMaxDrawdown,
  calculateRollingReturns,
  QuantMetrics 
} from "@/lib/quantstats";

const EMPTY = { dates: [] as Date[], returns: [] as number[], bench: [] as number[], symbol: "", benchmark: "" };

/** Real daily returns for a symbol and a benchmark, on the dates both traded. */
async function loadReturns(symbol: string, benchmark: string) {
  const [a, b] = await Promise.all([loadBars(symbol, "daily", "2y"), symbol === benchmark ? null : loadBars(benchmark, "daily", "2y")]);
  const ra = dailyReturns(a.bars);
  const rb = b ? dailyReturns(b.bars) : ra;
  const aligned = alignReturns(ra, rb);
  if (aligned.dates.length < 30) throw new Error(`Not enough price history for ${symbol} (need at least 30 trading days).`);
  return {
    dates: aligned.dates.map((d) => new Date(`${d}T16:00:00`)),
    returns: aligned.a,
    bench: aligned.b,
    symbol,
    benchmark,
  };
}

export function QuantStatsModule() {
  const [riskFreeRate, setRiskFreeRate] = useState(5.0);
  const [symbolInput, setSymbolInput] = useState("SPY");
  const [symbol, setSymbol] = useState("SPY");
  const [benchmark, setBenchmark] = useState("QQQ");
  const query = useQuery({
    queryKey: ["quantstats", symbol, benchmark],
    queryFn: () => loadReturns(symbol, benchmark),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const data = query.data ?? EMPTY;
  const ready = data.returns.length >= 30;

  const metrics = useMemo(() => {
    return calculateAllMetrics(data.returns, data.dates, data.bench.length === data.returns.length ? data.bench : undefined, riskFreeRate / 100);
  }, [data, riskFreeRate]);

  const monthlyReturns = useMemo(() => {
    return generateMonthlyReturns(data.dates, data.returns);
  }, [data]);

  // Generate equity curve
  const equityCurve = useMemo(() => {
    let equity = 10000;
    return data.returns.map((r, i) => {
      equity *= (1 + r);
      return {
        date: data.dates[i].toLocaleDateString(),
        value: equity,
        drawdown: 0, // Will calculate below
      };
    });
  }, [data]);

  // Calculate drawdown curve
  const drawdownCurve = useMemo(() => {
    let peak = 10000;
    let equity = 10000;
    return data.returns.map((r, i) => {
      equity *= (1 + r);
      if (equity > peak) peak = equity;
      const dd = ((peak - equity) / peak) * 100;
      return {
        date: data.dates[i].toLocaleDateString(),
        drawdown: -dd,
      };
    });
  }, [data]);

  // Rolling Sharpe data
  const rollingSharpe = useMemo(() => {
    const window = 63; // ~3 months
    const rolling: { date: string; sharpe: number }[] = [];
    
    for (let i = window; i < data.returns.length; i++) {
      const windowReturns = data.returns.slice(i - window, i);
      const mean = windowReturns.reduce((a, b) => a + b, 0) / window;
      const std = Math.sqrt(windowReturns.map(r => Math.pow(r - mean, 2)).reduce((a, b) => a + b, 0) / window);
      const annualizedReturn = Math.pow(1 + mean, 252) - 1;
      const annualizedStd = std * Math.sqrt(252);
      const sharpe = annualizedStd > 0 ? (annualizedReturn - riskFreeRate / 100) / annualizedStd : 0;
      
      rolling.push({
        date: data.dates[i].toLocaleDateString(),
        sharpe,
      });
    }
    
    return rolling;
  }, [data, riskFreeRate]);

  // Monthly returns heatmap data
  const heatmapData = useMemo(() => {
    const years = [...new Set(monthlyReturns.map(m => m.year))];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return years.map(year => {
      const yearData: Record<string, number | null> = { year };
      months.forEach((month, idx) => {
        const found = monthlyReturns.find(m => m.year === year && m.month === idx);
        yearData[month] = found ? found.return * 100 : null;
      });
      return yearData;
    });
  }, [monthlyReturns]);

  const isRefreshing = query.isFetching;
  const handleRefresh = () => {
    const next = symbolInput.trim().toUpperCase();
    if (next && next !== symbol) setSymbol(next);
    else void query.refetch();
  };

  const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;
  const formatNumber = (value: number) => value.toFixed(2);

  const MetricCard = ({ label, value, format = "percent", positive = true }: { 
    label: string; 
    value: number; 
    format?: "percent" | "number" | "ratio";
    positive?: boolean;
  }) => {
    const displayValue = format === "percent" ? formatPercent(value) : formatNumber(value);
    const isPositive = format === "percent" ? value >= 0 : value >= 1;
    
    return (
      <div className="bg-card/50 rounded-lg p-3 border border-border">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className={`text-lg font-bold ${
          positive ? (isPositive ? "text-green-400" : "text-red-400") : "text-foreground"
        }`}>
          {displayValue}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-sm text-muted-foreground">
        Performance stats from real daily closing prices (last 2 years) for any stock or ETF, compared with a benchmark.
        The app doesn't store your account's daily balance history yet, so this analyzes a symbol rather than your account.
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <Label htmlFor="qs-symbol">Symbol</Label>
              <Input
                id="qs-symbol"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleRefresh()}
                className="w-28"
              />
            </div>
            <div>
              <Label htmlFor="qs-bench">Compare with</Label>
              <Input id="qs-bench" value={benchmark} onChange={(e) => setBenchmark(e.target.value.toUpperCase())} className="w-24" />
            </div>
            <div>
              <Label>Risk-Free Rate (%)</Label>
              <Input
                type="number"
                value={riskFreeRate}
                onChange={(e) => setRiskFreeRate(parseFloat(e.target.value) || 0)}
                className="w-24"
                step="0.25"
              />
            </div>
            <Button onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              Analyze
            </Button>
          </div>
        </CardContent>
      </Card>

      {query.isLoading && <p className="text-sm text-muted-foreground">Loading real price history for {symbol}…</p>}
      {query.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500" data-testid="quantstats-error">
          Couldn't analyze {symbol}: {(query.error as Error).message}
        </div>
      )}

      {ready && (<>
      {data.bench.length === data.returns.length && metrics.beta !== undefined && (
        <div className="text-sm text-muted-foreground" data-testid="quantstats-beta">
          {data.symbol} vs {data.benchmark}: beta {metrics.beta.toFixed(2)} (moves about {metrics.beta.toFixed(2)}× as much), alpha {((metrics.alpha ?? 0) * 100).toFixed(2)}%/yr · {data.returns.length} trading days
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard label="CAGR" value={metrics.cagr} />
        <MetricCard label="Total Return" value={metrics.totalReturn} />
        <MetricCard label="Sharpe Ratio" value={metrics.sharpeRatio} format="number" />
        <MetricCard label="Sortino Ratio" value={metrics.sortinoRatio} format="number" />
        <MetricCard label="Calmar Ratio" value={metrics.calmarRatio} format="number" />
        <MetricCard label="Max Drawdown" value={-metrics.maxDrawdown} />
        <MetricCard label="Volatility (Ann.)" value={metrics.annualizedVolatility} />
        <MetricCard label="VaR (95%)" value={-metrics.var95} />
        <MetricCard label="CVaR (95%)" value={-metrics.cvar95} />
        <MetricCard label="Up days" value={metrics.winRate} />
        <MetricCard label="Up/down day ratio" value={metrics.profitFactor} format="number" />
        <MetricCard label="Skewness" value={metrics.skewness} format="number" positive={false} />
      </div>

      <Tabs defaultValue="equity" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="equity">
            <TrendingUp className="w-4 h-4 mr-2" />
            Equity Curve
          </TabsTrigger>
          <TabsTrigger value="drawdown">
            <TrendingDown className="w-4 h-4 mr-2" />
            Drawdowns
          </TabsTrigger>
          <TabsTrigger value="rolling">
            <Activity className="w-4 h-4 mr-2" />
            Rolling Sharpe
          </TabsTrigger>
          <TabsTrigger value="monthly">
            <Calendar className="w-4 h-4 mr-2" />
            Monthly Returns
          </TabsTrigger>
        </TabsList>

        <TabsContent value="equity">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                {data.symbol} growth of $10,000
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={equityCurve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value, index) => index % 20 === 0 ? value : ''}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(value) => `$${(value/1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Portfolio Value']}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drawdown">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5" />
                Underwater (Drawdown) Chart
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={drawdownCurve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value, index) => index % 20 === 0 ? value : ''}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [`${value.toFixed(2)}%`, 'Drawdown']}
                  />
                  <Area
                    type="monotone"
                    dataKey="drawdown"
                    stroke="hsl(var(--destructive))"
                    fill="hsl(var(--destructive))"
                    fillOpacity={0.3}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rolling">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Rolling 3-Month Sharpe Ratio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={rollingSharpe}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value, index) => index % 20 === 0 ? value : ''}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [value.toFixed(2), 'Sharpe Ratio']}
                  />
                  {/* Reference line at 0 */}
                  <Line
                    type="monotone"
                    dataKey="sharpe"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Monthly Returns Heatmap
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="p-2 text-left text-muted-foreground">Year</th>
                      {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(month => (
                        <th key={month} className="p-2 text-center text-muted-foreground">{month}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapData.map((row) => (
                      <tr key={row.year}>
                        <td className="p-2 font-medium">{row.year}</td>
                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(month => {
                          const value = row[month];
                          const bgColor = value === null 
                            ? 'bg-muted/20' 
                            : value >= 0 
                              ? `bg-green-500/${Math.min(Math.abs(value) * 10, 50)}` 
                              : `bg-red-500/${Math.min(Math.abs(value) * 10, 50)}`;
                          
                          return (
                            <td 
                              key={month} 
                              className={`p-2 text-center text-xs font-medium ${
                                value !== null 
                                  ? value >= 0 ? 'text-green-400' : 'text-red-400'
                                  : 'text-muted-foreground'
                              }`}
                              style={{
                                backgroundColor: value !== null 
                                  ? value >= 0 
                                    ? `rgba(34, 197, 94, ${Math.min(Math.abs(value) / 10, 0.5)})` 
                                    : `rgba(239, 68, 68, ${Math.min(Math.abs(value) / 10, 0.5)})`
                                  : undefined
                              }}
                            >
                              {value !== null ? `${value.toFixed(1)}%` : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Trade Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Trade Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-card/50 rounded-lg border border-border">
              <div className="text-2xl font-bold text-green-400">{formatPercent(metrics.avgWin)}</div>
              <div className="text-sm text-muted-foreground">Average Win</div>
            </div>
            <div className="text-center p-4 bg-card/50 rounded-lg border border-border">
              <div className="text-2xl font-bold text-red-400">{formatPercent(metrics.avgLoss)}</div>
              <div className="text-sm text-muted-foreground">Average Loss</div>
            </div>
            <div className="text-center p-4 bg-card/50 rounded-lg border border-border">
              <div className="text-2xl font-bold text-green-400">{formatPercent(metrics.bestDay)}</div>
              <div className="text-sm text-muted-foreground">Best Day</div>
            </div>
            <div className="text-center p-4 bg-card/50 rounded-lg border border-border">
              <div className="text-2xl font-bold text-red-400">{formatPercent(metrics.worstDay)}</div>
              <div className="text-sm text-muted-foreground">Worst Day</div>
            </div>
          </div>
        </CardContent>
      </Card>
      </>)}
    </div>
  );
}
