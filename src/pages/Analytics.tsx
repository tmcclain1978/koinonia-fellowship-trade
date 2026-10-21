import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadBars, loadOptionChain } from "@/lib/marketData/history";
import { TIMEFRAME_INTERVAL, optionsView, priceViews } from "@/lib/analytics/analyticsViews";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, Cell } from 'recharts';
import { TrendingUp, Activity, BarChart3, GitBranch, Newspaper, FlaskConical } from "lucide-react";
import Navigation from "@/components/Navigation";
import { NewsSentimentDashboard } from "@/components/NewsSentimentDashboard";
import { BacktestingModule } from "@/components/BacktestingModule";
import { MobileTabNav } from "@/components/MobileTabNav";
import { HelpTooltip } from "@/components/ui/help-tooltip";

const Analytics = () => {
  const [symbol, setSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState("1d");

  // Real data only: candles for the volume/indicator charts, the Schwab option
  // chain for the strike charts. Each card says when its data isn't available.
  const [activeSymbol, setActiveSymbol] = useState("AAPL");
  const daily = timeframe === "1d";
  const barsQuery = useQuery({
    queryKey: ["analytics-bars", activeSymbol, timeframe],
    queryFn: () => loadBars(activeSymbol, TIMEFRAME_INTERVAL[timeframe] ?? "daily", daily ? "1y" : "10d"),
    staleTime: 60_000,
    retry: 1,
  });
  const chainQuery = useQuery({
    queryKey: ["analytics-chain", activeSymbol],
    queryFn: () => loadOptionChain(activeSymbol, 45, 30),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const views = useMemo(() => (barsQuery.data ? priceViews(barsQuery.data.bars, daily) : null), [barsQuery.data, daily]);
  const opt = useMemo(() => (chainQuery.data ? optionsView(chainQuery.data.contracts, chainQuery.data.spot) : null), [chainQuery.data]);
  const volumeData = views?.volume ?? [];
  const technicalIndicators = views?.technicals ?? [];
  const heatmapData = opt?.heatmap ?? [];
  const ivOiData = opt?.ivOi ?? [];
  const maxStrikeVolume = Math.max(1, ...heatmapData.map((d) => d.volume));
  const refresh = () => {
    if (symbol && symbol !== activeSymbol) setActiveSymbol(symbol);
    else {
      void barsQuery.refetch();
      void chainQuery.refetch();
    }
  };
  const errText = (e: unknown) => (e as Error)?.message ?? "Unavailable";

  const getHeatmapColor = (value: number, max: number) => {
    const intensity = value / max;
    if (intensity > 0.8) return 'hsl(var(--primary))';
    if (intensity > 0.6) return 'hsl(var(--accent))';
    if (intensity > 0.4) return 'hsl(142, 76%, 36%)';
    if (intensity > 0.2) return 'hsl(47, 96%, 53%)';
    return 'hsl(var(--muted))';
  };

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background pt-16 pb-20 lg:pb-8">
        <div className="container mx-auto px-4 sm:px-6 py-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Advanced Analytics</h1>
          <p className="text-muted-foreground mb-6">
            Deep market analysis with heat maps, IV/OI charts, technical indicators, news sentiment, and strategy backtesting
          </p>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6 text-sm text-muted-foreground" data-testid="analytics-status">
            Real market data for {activeSymbol}: price bars from {barsQuery.data?.source === "schwab" ? "Schwab" : barsQuery.data?.source ?? "…"}
            {opt ? `, options from Schwab (expiration ${opt.expiration})` : ""}. If something can't be loaded, that chart says so instead of showing samples.
          </div>

          {/* Controls */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <Label>Symbol</Label>
                  <Input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && refresh()}
                    className="w-32"
                  />
                </div>
                <div>
                  <Label>Timeframe</Label>
                  <Select value={timeframe} onValueChange={setTimeframe}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1m">1 Minute</SelectItem>
                      <SelectItem value="5m">5 Minutes</SelectItem>
                      <SelectItem value="15m">15 Minutes</SelectItem>
                      <SelectItem value="1h">1 Hour</SelectItem>
                      <SelectItem value="1d">1 Day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={refresh} disabled={barsQuery.isFetching || chainQuery.isFetching}>
                  <Activity className="w-4 h-4 mr-2" />
                  {symbol !== activeSymbol ? "Load" : "Refresh Data"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Advanced Charts Grid */}
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            {/* Volume Profile */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Volume by bar - {activeSymbol}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {barsQuery.isLoading ? <p className="text-sm text-muted-foreground mb-2">Loading price bars…</p> : barsQuery.error ? <p className="text-sm text-red-500 mb-2" data-testid="bars-error">Couldn't load price bars: {errText(barsQuery.error)}</p> : null}
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="volume" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Technical Indicators */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Technical Indicators (RSI 14, MACD)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {barsQuery.isLoading ? <p className="text-sm text-muted-foreground mb-2">Loading price bars…</p> : barsQuery.error ? <p className="text-sm text-red-500 mb-2" data-testid="bars-error">Couldn't load price bars: {errText(barsQuery.error)}</p> : null}
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={technicalIndicators}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="rsi" stroke="hsl(var(--primary))" strokeWidth={2} />
                    <Line type="monotone" dataKey="macd" stroke="hsl(var(--accent))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Heat Map */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Options Heat Map - Strike vs Volume
              </CardTitle>
            </CardHeader>
            <CardContent>
              {chainQuery.isLoading ? <p className="text-sm text-muted-foreground mb-2">Loading option chain…</p> : chainQuery.error ? <p className="text-sm text-amber-500 mb-2" data-testid="chain-error">No option data: {errText(chainQuery.error)}</p> : null}
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={heatmapData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                  <YAxis dataKey="strike" type="category" stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="volume" fill="hsl(var(--primary))">
                    {heatmapData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getHeatmapColor(entry.volume, maxStrikeVolume)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-4 justify-center text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                  <span>High Volume</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(var(--accent))' }} />
                  <span>Medium-High</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(142, 76%, 36%)' }} />
                  <span>Medium</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(47, 96%, 53%)' }} />
                  <span>Low</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* IV/OI Chart */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="w-5 h-5" />
                Implied Volatility vs Open Interest
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold mb-3 text-center">Call Options</h3>
                  {chainQuery.isLoading ? <p className="text-sm text-muted-foreground mb-2">Loading option chain…</p> : chainQuery.error ? <p className="text-sm text-amber-500 mb-2" data-testid="chain-error">No option data: {errText(chainQuery.error)}</p> : null}
                  <ResponsiveContainer width="100%" height={300}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="strike"
                        name="Strike"
                        stroke="hsl(var(--muted-foreground))"
                        label={{ value: 'Strike Price', position: 'insideBottom', offset: -5 }}
                      />
                      <YAxis
                        dataKey="iv"
                        name="IV"
                        stroke="hsl(var(--muted-foreground))"
                        label={{ value: 'Implied Volatility %', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Scatter
                        data={ivOiData.filter(d => d.type === 'call')}
                        fill="hsl(142, 76%, 36%)"
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-3 text-center">Put Options</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="strike"
                        name="Strike"
                        stroke="hsl(var(--muted-foreground))"
                        label={{ value: 'Strike Price', position: 'insideBottom', offset: -5 }}
                      />
                      <YAxis
                        dataKey="iv"
                        name="IV"
                        stroke="hsl(var(--muted-foreground))"
                        label={{ value: 'Implied Volatility %', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Scatter
                        data={ivOiData.filter(d => d.type === 'put')}
                        fill="hsl(0, 84%, 60%)"
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-3">Open Interest by Strike</h3>
                {chainQuery.isLoading ? <p className="text-sm text-muted-foreground mb-2">Loading option chain…</p> : chainQuery.error ? <p className="text-sm text-amber-500 mb-2" data-testid="chain-error">No option data: {errText(chainQuery.error)}</p> : null}
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={ivOiData.filter(d => d.type === 'call')}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="strike" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="oi"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Research & Testing Section */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FlaskConical className="w-6 h-6" />
              Research & Testing
            </h2>

            {/* News Sentiment Dashboard */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Newspaper className="w-5 h-5" />
                  News Sentiment Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <NewsSentimentDashboard />
              </CardContent>
            </Card>

            {/* Backtesting Module */}
            <BacktestingModule />
          </div>
        </div>
      </div>
      <MobileTabNav />
    </>
  );
};

export default Analytics;
