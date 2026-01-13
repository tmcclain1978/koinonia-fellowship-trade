import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { TrendingDown, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface EquityPoint {
  date: string;
  balance: number;
  drawdown: number;
  drawdownPercent: number;
}

export const DrawdownChart = () => {
  const [equityData, setEquityData] = useState<EquityPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [startingBalance, setStartingBalance] = useState(100000);

  useEffect(() => {
    loadEquityData();
  }, []);

  const loadEquityData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get account info
      const { data: account } = await supabase
        .from('paper_trading_accounts')
        .select('starting_balance, balance')
        .eq('user_id', session.user.id)
        .maybeSingle();

      const initialBalance = account?.starting_balance || 100000;
      setStartingBalance(initialBalance);

      // Get all trades with profit/loss
      const { data: trades } = await supabase
        .from('paper_trades')
        .select('profit_loss, executed_at')
        .eq('user_id', session.user.id)
        .not('profit_loss', 'is', null)
        .order('executed_at', { ascending: true });

      if (!trades || trades.length === 0) {
        setIsLoading(false);
        return;
      }

      // Build equity curve
      let runningBalance = initialBalance;
      let peak = initialBalance;
      const equityPoints: EquityPoint[] = [{
        date: format(new Date(trades[0].executed_at), 'MM/dd'),
        balance: initialBalance,
        drawdown: 0,
        drawdownPercent: 0,
      }];

      trades.forEach(trade => {
        runningBalance += (trade.profit_loss || 0);
        peak = Math.max(peak, runningBalance);
        const drawdown = peak - runningBalance;
        const drawdownPercent = (drawdown / peak) * 100;

        equityPoints.push({
          date: format(new Date(trade.executed_at), 'MM/dd'),
          balance: Math.round(runningBalance * 100) / 100,
          drawdown: Math.round(drawdown * 100) / 100,
          drawdownPercent: Math.round(drawdownPercent * 100) / 100,
        });
      });

      setEquityData(equityPoints);
    } catch (error) {
      console.error('Error loading equity data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const stats = useMemo(() => {
    if (equityData.length === 0) return null;

    const currentBalance = equityData[equityData.length - 1]?.balance || startingBalance;
    const maxDrawdown = Math.max(...equityData.map(d => d.drawdownPercent));
    const currentDrawdown = equityData[equityData.length - 1]?.drawdownPercent || 0;
    const totalReturn = ((currentBalance - startingBalance) / startingBalance) * 100;

    return {
      currentBalance,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      currentDrawdown: Math.round(currentDrawdown * 100) / 100,
      totalReturn: Math.round(totalReturn * 100) / 100,
    };
  }, [equityData, startingBalance]);

  const isInDrawdown = (stats?.currentDrawdown || 0) > 0;
  const isSevereDrawdown = (stats?.currentDrawdown || 0) > 10;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-destructive" />
            Equity & Drawdown
          </CardTitle>
          {stats && (
            <div className="flex gap-2">
              <Badge variant={stats.totalReturn >= 0 ? 'default' : 'destructive'}>
                {stats.totalReturn >= 0 ? '+' : ''}{stats.totalReturn}% Total
              </Badge>
              {isInDrawdown && (
                <Badge variant="outline" className="border-destructive text-destructive">
                  -{stats.currentDrawdown}% DD
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : equityData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <TrendingDown className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No trade data available</p>
            <p className="text-sm">Complete some trades to see your equity curve</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Severe Drawdown Warning */}
            {isSevereDrawdown && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <div>
                  <p className="font-semibold text-destructive">Significant Drawdown</p>
                  <p className="text-xs text-muted-foreground">
                    Your account is down {stats?.currentDrawdown}% from peak. Consider reducing position sizes.
                  </p>
                </div>
              </div>
            )}

            {/* Equity Curve Chart */}
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityData}>
                  <defs>
                    <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [`$${value.toLocaleString()}`, 'Balance']}
                  />
                  <ReferenceLine 
                    y={startingBalance} 
                    stroke="hsl(var(--muted-foreground))" 
                    strokeDasharray="3 3" 
                    label={{ value: 'Start', fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="balance" 
                    stroke="hsl(var(--primary))" 
                    fill="url(#balanceGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Drawdown Chart */}
            <div className="h-[100px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityData}>
                  <defs>
                    <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    tickFormatter={(val) => `-${val}%`}
                    tickLine={false}
                    domain={[0, 'auto']}
                    reversed
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [`-${value}%`, 'Drawdown']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="drawdownPercent" 
                    stroke="hsl(var(--destructive))" 
                    fill="url(#drawdownGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Stats Row */}
            {stats && (
              <div className="grid grid-cols-3 gap-4 text-center pt-2 border-t border-border">
                <div>
                  <p className="text-xs text-muted-foreground">Current Balance</p>
                  <p className="text-lg font-bold">${stats.currentBalance.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Max Drawdown</p>
                  <p className="text-lg font-bold text-destructive">-{stats.maxDrawdown}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Return</p>
                  <p className={`text-lg font-bold ${stats.totalReturn >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {stats.totalReturn >= 0 ? '+' : ''}{stats.totalReturn}%
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
