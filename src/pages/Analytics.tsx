import { useState } from "react";
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

const Analytics = () => {
  const [symbol, setSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState("1d");

  // Mock data for advanced charts
  const volumeData = [
    { time: '9:30', volume: 1200, price: 175 },
    { time: '10:00', volume: 1500, price: 176.5 },
    { time: '10:30', volume: 1800, price: 174.2 },
    { time: '11:00', volume: 2100, price: 177.8 },
    { time: '11:30', volume: 1900, price: 179.3 },
    { time: '12:00', volume: 1600, price: 178.5 },
  ];

  const heatmapData = [
    { strike: 170, call: 12.5, put: 2.3, volume: 2500 },
    { strike: 172.5, call: 10.8, put: 3.1, volume: 3200 },
    { strike: 175, call: 9.2, put: 4.5, volume: 5100 },
    { strike: 177.5, call: 7.5, put: 6.2, volume: 4800 },
    { strike: 180, call: 5.8, put: 8.1, volume: 6200 },
    { strike: 182.5, call: 4.2, put: 10.5, volume: 3900 },
    { strike: 185, call: 2.8, put: 13.2, volume: 2100 },
  ];

  const ivOiData = [
    { strike: 170, iv: 25.5, oi: 1200, type: 'call' },
    { strike: 172.5, iv: 27.2, oi: 1800, type: 'call' },
    { strike: 175, iv: 29.8, oi: 3200, type: 'call' },
    { strike: 177.5, iv: 31.5, oi: 2800, type: 'call' },
    { strike: 180, iv: 33.2, oi: 4100, type: 'call' },
    { strike: 182.5, iv: 30.8, oi: 2200, type: 'call' },
    { strike: 185, iv: 28.5, oi: 1500, type: 'call' },
    { strike: 170, iv: 28.2, oi: 800, type: 'put' },
    { strike: 172.5, iv: 30.5, oi: 1200, type: 'put' },
    { strike: 175, iv: 32.8, oi: 2100, type: 'put' },
    { strike: 177.5, iv: 35.2, oi: 2800, type: 'put' },
    { strike: 180, iv: 37.5, oi: 3500, type: 'put' },
    { strike: 182.5, iv: 34.8, oi: 2400, type: 'put' },
    { strike: 185, iv: 32.1, oi: 1800, type: 'put' },
  ];

  const technicalIndicators = [
    { time: '9:30', price: 175, rsi: 45, macd: 0.5 },
    { time: '10:00', price: 176.5, rsi: 52, macd: 0.8 },
    { time: '10:30', price: 174.2, rsi: 38, macd: -0.2 },
    { time: '11:00', price: 177.8, rsi: 65, macd: 1.2 },
    { time: '11:30', price: 179.3, rsi: 72, macd: 1.8 },
    { time: '12:00', price: 178.5, rsi: 68, macd: 1.5 },
  ];

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
      <div className="min-h-screen bg-background pt-16">
        <div className="container mx-auto px-6 py-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Advanced Analytics</h1>
          <p className="text-muted-foreground mb-6">
            Deep market analysis with heat maps, IV/OI charts, technical indicators, news sentiment, and strategy backtesting
          </p>

          {/* Demo Data Notice */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6 flex items-start gap-3">
            <span className="bg-yellow-500 text-black text-xs font-semibold px-2 py-1 rounded shrink-0">DEMO DATA</span>
            <p className="text-sm text-muted-foreground">
              Charts on this page display sample data for demonstration purposes. 
              Connect your brokerage account to view real market data and analytics.
            </p>
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
                <Button>
                  <Activity className="w-4 h-4 mr-2" />
                  Refresh Data
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
                  Volume Profile - {symbol}
                </CardTitle>
              </CardHeader>
              <CardContent>
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
                  Technical Indicators
                </CardTitle>
              </CardHeader>
              <CardContent>
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
                      <Cell key={`cell-${index}`} fill={getHeatmapColor(entry.volume, 6200)} />
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
    </>
  );
};

export default Analytics;
