import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Play, Target, TrendingUp, TrendingDown, BarChart3, Calendar,
  Loader2, ArrowUpDown, AlertTriangle
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from "recharts";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface WLSMResults {
  summary: {
    totalSetups: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnl: number;
    avgPnl: number;
    profitFactor: number;
    maxDrawdown: number;
    avgRR: number;
    initialCapital: number;
    finalCapital: number;
    totalReturnPercent: number;
  };
  dayStats: {
    wednesday: DayStat;
    thursday: DayStat;
    friday: DayStat;
  };
  scoreDistribution: { score: number; count: number }[];
  setupTypeStats: {
    magnet: { total: number; wins: number; winRate: number };
    sweep: { total: number; wins: number; winRate: number };
  };
  equityCurve: { date: string; equity: number; pnl: number }[];
  trades: Trade[];
  weeklyLevels: any[];
}

interface DayStat {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgScore: number;
  totalPnl: number;
}

interface Trade {
  date: string;
  dayOfWeek: string;
  targetLevel: string;
  targetPrice: number;
  direction: string;
  setupType: string;
  score: number;
  outcome: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
}

const TEST_VARIANTS = [
  { value: "either_side", label: "Either Side Touched" },
  { value: "high_only", label: "High Touched Only" },
  { value: "low_only", label: "Low Touched Only" },
  { value: "continuation", label: "Continuation After Touch" },
  { value: "reversal", label: "Reversal After Touch" },
];

export function WLSMBacktester() {
  const [symbol, setSymbol] = useState("SPY");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [testVariant, setTestVariant] = useState("either_side");
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<WLSMResults | null>(null);
  const { toast } = useToast();

  const runBacktest = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("wlsm-backtest", {
        body: { symbol, startDate, endDate, testVariant, initialCapital: 100000 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResults(data);
      toast({ title: "WLSM Backtest Complete", description: `${data.summary.totalSetups} setups found, ${data.summary.winRate}% win rate` });
    } catch (err: any) {
      toast({ title: "Backtest Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Strategy Overview */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Weekly Liquidity Sweep Model (WLSM)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Tests whether Wed attacks Mon's range, Thu attacks Tue's range, and Fri attacks Mon/Wed's range.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Symbol</Label>
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Test Variant</Label>
              <Select value={testVariant} onValueChange={setTestVariant}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEST_VARIANTS.map((v) => (
                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={runBacktest} disabled={isRunning} className="w-full h-8 text-sm">
                {isRunning ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                Run
              </Button>
            </div>
          </div>

          {/* Weekly Map Legend */}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Wed → Mon levels</span>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Thu → Tue levels</span>
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Fri → Mon + Wed levels</span>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <Tabs defaultValue="summary" className="space-y-3">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="summary" className="text-xs">Summary</TabsTrigger>
            <TabsTrigger value="equity" className="text-xs">Equity Curve</TabsTrigger>
            <TabsTrigger value="trades" className="text-xs">Trade Log</TabsTrigger>
            <TabsTrigger value="weekly" className="text-xs">Weekly Map</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-3">
            {/* Top Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Total Setups" value={results.summary.totalSetups} />
              <MetricCard label="Win Rate" value={`${results.summary.winRate}%`} color={results.summary.winRate >= 50 ? "text-green-500" : "text-red-500"} />
              <MetricCard label="Total P&L" value={`$${results.summary.totalPnl.toLocaleString()}`} color={results.summary.totalPnl >= 0 ? "text-green-500" : "text-red-500"} />
              <MetricCard label="Profit Factor" value={results.summary.profitFactor} color={results.summary.profitFactor >= 1 ? "text-green-500" : "text-red-500"} />
              <MetricCard label="Max Drawdown" value={`${results.summary.maxDrawdown}%`} color="text-red-500" />
              <MetricCard label="Return" value={`${results.summary.totalReturnPercent}%`} color={results.summary.totalReturnPercent >= 0 ? "text-green-500" : "text-red-500"} />
            </div>

            {/* Day-of-Week Stats */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Day-of-Week Hit Rates</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {(["wednesday", "thursday", "friday"] as const).map((day) => {
                    const stat = results.dayStats[day];
                    return (
                      <div key={day} className="p-3 bg-muted/50 rounded-lg text-center">
                        <p className="text-xs font-medium capitalize mb-1">{day}</p>
                        <p className="text-lg font-bold">{stat.winRate}%</p>
                        <p className="text-xs text-muted-foreground">{stat.wins}W / {stat.losses}L ({stat.total})</p>
                        <p className="text-xs text-muted-foreground">Avg Score: {stat.avgScore}</p>
                        <p className={`text-xs font-medium ${stat.totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                          ${stat.totalPnl.toLocaleString()}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Setup Type Stats */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Setup Type Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-3 h-3 text-green-500" />
                      <span className="text-xs font-medium">Magnet Continuation</span>
                    </div>
                    <p className="text-lg font-bold">{results.setupTypeStats.magnet.winRate}%</p>
                    <p className="text-xs text-muted-foreground">{results.setupTypeStats.magnet.wins}W / {results.setupTypeStats.magnet.total} total</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <ArrowUpDown className="w-3 h-3 text-blue-500" />
                      <span className="text-xs font-medium">Sweep & Reject</span>
                    </div>
                    <p className="text-lg font-bold">{results.setupTypeStats.sweep.winRate}%</p>
                    <p className="text-xs text-muted-foreground">{results.setupTypeStats.sweep.wins}W / {results.setupTypeStats.sweep.total} total</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Score Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Setup Score Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={results.scoreDistribution}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="score" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {results.scoreDistribution.map((entry, i) => (
                        <Cell key={i} fill={entry.score >= 8 ? "hsl(var(--chart-2))" : entry.score >= 6 ? "hsl(var(--chart-4))" : "hsl(var(--muted-foreground))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> A-grade (8-10)</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> Tradable (6-7)</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground" /> Pass (≤5)</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Equity Curve Tab */}
          <TabsContent value="equity">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Equity Curve
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={results.equityCurve}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, "Equity"]} />
                    <Area type="monotone" dataKey="equity" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trade Log Tab */}
          <TabsContent value="trades">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Trade Log ({results.trades.length} trades)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Day</TableHead>
                        <TableHead className="text-xs">Target</TableHead>
                        <TableHead className="text-xs">Dir</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Score</TableHead>
                        <TableHead className="text-xs">Entry</TableHead>
                        <TableHead className="text-xs">Exit</TableHead>
                        <TableHead className="text-xs text-right">P&L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.trades.map((t, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{t.date}</TableCell>
                          <TableCell className="text-xs">{t.dayOfWeek.slice(0, 3)}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="text-[10px]">{t.targetLevel.replace("_", " ")}</Badge>
                          </TableCell>
                          <TableCell>
                            {t.direction === "bullish"
                              ? <TrendingUp className="w-3 h-3 text-green-500" />
                              : <TrendingDown className="w-3 h-3 text-red-500" />}
                          </TableCell>
                          <TableCell className="text-[10px]">{t.setupType === "magnet_continuation" ? "Magnet" : "Sweep"}</TableCell>
                          <TableCell>
                            <Badge variant={t.score >= 8 ? "default" : t.score >= 6 ? "secondary" : "outline"} className="text-[10px]">
                              {t.score}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">${t.entryPrice.toFixed(2)}</TableCell>
                          <TableCell className="text-xs">${t.exitPrice.toFixed(2)}</TableCell>
                          <TableCell className={`text-xs text-right font-medium ${t.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                            ${t.pnl.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Weekly Map Tab */}
          <TabsContent value="weekly">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Weekly Level Map
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Week</TableHead>
                        <TableHead className="text-xs">Mon H</TableHead>
                        <TableHead className="text-xs">Mon L</TableHead>
                        <TableHead className="text-xs">Tue H</TableHead>
                        <TableHead className="text-xs">Tue L</TableHead>
                        <TableHead className="text-xs">Wed H</TableHead>
                        <TableHead className="text-xs">Wed L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.weeklyLevels.map((w: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-medium">{w.weekStart}</TableCell>
                          <TableCell className="text-xs">
                            <span className={w.mon_high_touched ? "text-green-500" : "text-muted-foreground"}>
                              {w.mon_high?.toFixed(2)} {w.mon_high_touched ? "✓" : "○"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className={w.mon_low_touched ? "text-red-500" : "text-muted-foreground"}>
                              {w.mon_low?.toFixed(2)} {w.mon_low_touched ? "✓" : "○"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className={w.tue_high_touched ? "text-green-500" : "text-muted-foreground"}>
                              {w.tue_high?.toFixed(2)} {w.tue_high_touched ? "✓" : "○"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className={w.tue_low_touched ? "text-red-500" : "text-muted-foreground"}>
                              {w.tue_low?.toFixed(2)} {w.tue_low_touched ? "✓" : "○"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            {w.wed_high ? (
                              <span className={w.wed_high_touched ? "text-green-500" : "text-muted-foreground"}>
                                {w.wed_high.toFixed(2)} {w.wed_high_touched ? "✓" : "○"}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {w.wed_low ? (
                              <span className={w.wed_low_touched ? "text-red-500" : "text-muted-foreground"}>
                                {w.wed_low.toFixed(2)} {w.wed_low_touched ? "✓" : "○"}
                              </span>
                            ) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
        <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          This backtester uses daily bar data with simplified assumptions. Intraday VWAP, opening range, and time-of-day filters use proxy calculations. Past performance does not guarantee future results. Not investment advice.
        </p>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="p-3 bg-muted/50 rounded-lg">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${color || ""}`}>{value}</p>
    </div>
  );
}
