import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Target, Calendar, Award, AlertTriangle, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";

interface Trade {
  id: string;
  symbol: string;
  action: string;
  quantity: number;
  price: number;
  total_value: number;
  profit_loss: number | null;
  executed_at: string;
  notes: string;
}

interface AnalyticsSummary {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgHoldingPeriod: string;
}

const COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#a855f7', '#f59e0b', '#06b6d4'];

export const PaperTradingAnalytics = () => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<string>("30");
  const [account, setAccount] = useState<any>(null);

  useEffect(() => {
    loadTradesAndAccount();
  }, [timeRange]);

  const loadTradesAndAccount = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const daysAgo = parseInt(timeRange);
      const startDate = subDays(new Date(), daysAgo).toISOString();

      const [tradesResult, accountResult] = await Promise.all([
        supabase
          .from('paper_trades')
          .select('*')
          .eq('user_id', user.id)
          .gte('executed_at', startDate)
          .order('executed_at', { ascending: true }),
        supabase
          .from('paper_trading_accounts')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()
      ]);

      if (tradesResult.error) throw tradesResult.error;
      setTrades(tradesResult.data || []);
      setAccount(accountResult.data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate analytics summary
  const summary = useMemo((): AnalyticsSummary => {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnL: 0,
        avgWin: 0,
        avgLoss: 0,
        largestWin: 0,
        largestLoss: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        avgHoldingPeriod: 'N/A'
      };
    }

    const tradesWithPnL = trades.filter(t => t.profit_loss !== null);
    const winningTrades = tradesWithPnL.filter(t => (t.profit_loss || 0) > 0);
    const losingTrades = tradesWithPnL.filter(t => (t.profit_loss || 0) < 0);
    
    const totalWins = winningTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0));
    
    const returns = tradesWithPnL.map(t => t.profit_loss || 0);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    
    // Calculate max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let runningPnL = 0;
    for (const trade of trades) {
      runningPnL += trade.profit_loss || 0;
      if (runningPnL > peak) peak = runningPnL;
      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: tradesWithPnL.length > 0 ? (winningTrades.length / tradesWithPnL.length) * 100 : 0,
      totalPnL: trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0),
      avgWin: winningTrades.length > 0 ? totalWins / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? totalLosses / losingTrades.length : 0,
      largestWin: Math.max(...winningTrades.map(t => t.profit_loss || 0), 0),
      largestLoss: Math.min(...losingTrades.map(t => t.profit_loss || 0), 0),
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0,
      sharpeRatio: stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0,
      maxDrawdown,
      avgHoldingPeriod: '1-2 days'
    };
  }, [trades]);

  // Equity curve data
  const equityCurve = useMemo(() => {
    if (!account) return [];
    
    let runningBalance = account.starting_balance;
    const curve = [{ date: format(subDays(new Date(), parseInt(timeRange)), 'MMM dd'), balance: runningBalance, pnl: 0 }];
    
    for (const trade of trades) {
      runningBalance += trade.profit_loss || 0;
      curve.push({
        date: format(new Date(trade.executed_at), 'MMM dd'),
        balance: runningBalance,
        pnl: trade.profit_loss || 0
      });
    }
    
    return curve;
  }, [trades, account, timeRange]);

  // Daily P&L data
  const dailyPnL = useMemo(() => {
    const dailyMap = new Map<string, number>();
    
    trades.forEach(trade => {
      const day = format(new Date(trade.executed_at), 'yyyy-MM-dd');
      dailyMap.set(day, (dailyMap.get(day) || 0) + (trade.profit_loss || 0));
    });

    return Array.from(dailyMap.entries())
      .map(([date, pnl]) => ({
        date: format(new Date(date), 'MMM dd'),
        pnl,
        color: pnl >= 0 ? '#22c55e' : '#ef4444'
      }))
      .slice(-30);
  }, [trades]);

  // Symbol performance
  const symbolPerformance = useMemo(() => {
    const symbolMap = new Map<string, { trades: number; pnl: number; wins: number }>();
    
    trades.forEach(trade => {
      const current = symbolMap.get(trade.symbol) || { trades: 0, pnl: 0, wins: 0 };
      current.trades++;
      current.pnl += trade.profit_loss || 0;
      if ((trade.profit_loss || 0) > 0) current.wins++;
      symbolMap.set(trade.symbol, current);
    });

    return Array.from(symbolMap.entries())
      .map(([symbol, data]) => ({
        symbol,
        trades: data.trades,
        pnl: data.pnl,
        winRate: (data.wins / data.trades) * 100
      }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [trades]);

  // Export trades to CSV
  const exportToCSV = () => {
    const headers = ['Date', 'Symbol', 'Action', 'Quantity', 'Price', 'Total Value', 'P&L', 'Notes'];
    const csvData = trades.map(t => [
      format(new Date(t.executed_at), 'yyyy-MM-dd HH:mm'),
      t.symbol,
      t.action,
      t.quantity,
      t.price,
      t.total_value,
      t.profit_loss || 0,
      t.notes || ''
    ]);

    const csv = [headers.join(','), ...csvData.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paper_trades_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Trading Analytics</h2>
          <p className="text-muted-foreground">Performance analysis for your paper trading</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total P&L</span>
            </div>
            <div className={`text-2xl font-bold ${summary.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              ${summary.totalPnL.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Win Rate</span>
            </div>
            <div className="text-2xl font-bold">{summary.winRate.toFixed(1)}%</div>
            <Progress value={summary.winRate} className="h-1 mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Profit Factor</span>
            </div>
            <div className="text-2xl font-bold">
              {summary.profitFactor === Infinity ? '∞' : summary.profitFactor.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Avg Win</span>
            </div>
            <div className="text-2xl font-bold text-green-500">${summary.avgWin.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Avg Loss</span>
            </div>
            <div className="text-2xl font-bold text-red-500">${summary.avgLoss.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">Max Drawdown</span>
            </div>
            <div className="text-2xl font-bold text-amber-500">${summary.maxDrawdown.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="equity" className="w-full">
        <TabsList>
          <TabsTrigger value="equity">Equity Curve</TabsTrigger>
          <TabsTrigger value="daily">Daily P&L</TabsTrigger>
          <TabsTrigger value="symbols">By Symbol</TabsTrigger>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
        </TabsList>

        <TabsContent value="equity">
          <Card>
            <CardHeader>
              <CardTitle>Portfolio Equity Curve</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityCurve}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" />
                    <YAxis tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'Balance']} />
                    <Area 
                      type="monotone" 
                      dataKey="balance" 
                      stroke="#3b82f6" 
                      fill="#3b82f6" 
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily">
          <Card>
            <CardHeader>
              <CardTitle>Daily Profit & Loss</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyPnL}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" />
                    <YAxis tickFormatter={(val) => `$${val}`} />
                    <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, 'P&L']} />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {dailyPnL.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="symbols">
          <Card>
            <CardHeader>
              <CardTitle>Performance by Symbol</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {symbolPerformance.map((sym, idx) => (
                  <div key={sym.symbol} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{sym.symbol}</Badge>
                      <span className="text-sm text-muted-foreground">{sym.trades} trades</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Win Rate</div>
                        <div className="font-medium">{sym.winRate.toFixed(1)}%</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">P&L</div>
                        <div className={`font-bold ${sym.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          ${sym.pnl.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {symbolPerformance.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No trades in selected period</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Win/Loss Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Wins', value: summary.winningTrades, color: '#22c55e' },
                          { name: 'Losses', value: summary.losingTrades, color: '#ef4444' }
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }: { name?: string | number; percent?: number }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      >
                        <Cell fill="#22c55e" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Risk Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Sharpe Ratio</span>
                  <span className="font-bold">{summary.sharpeRatio.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Profit Factor</span>
                  <span className="font-bold">
                    {summary.profitFactor === Infinity ? '∞' : summary.profitFactor.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Max Drawdown</span>
                  <span className="font-bold text-red-500">${summary.maxDrawdown.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Largest Win</span>
                  <span className="font-bold text-green-500">${summary.largestWin.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Largest Loss</span>
                  <span className="font-bold text-red-500">${summary.largestLoss.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Trades</span>
                  <span className="font-bold">{summary.totalTrades}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
