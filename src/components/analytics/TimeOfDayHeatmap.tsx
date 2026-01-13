import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface HourlyPerformance {
  hour: number;
  wins: number;
  losses: number;
  totalPnL: number;
  tradeCount: number;
  winRate: number;
}

export const TimeOfDayHeatmap = () => {
  const [hourlyData, setHourlyData] = useState<HourlyPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTimeData();
  }, []);

  const loadTimeData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: trades } = await supabase
        .from('paper_trades')
        .select('profit_loss, executed_at')
        .eq('user_id', session.user.id)
        .not('profit_loss', 'is', null);

      if (!trades || trades.length === 0) {
        setIsLoading(false);
        return;
      }

      // Initialize hours (market hours 9:30 AM - 4:00 PM ET = hours 9-16)
      const hourlyMap = new Map<number, HourlyPerformance>();
      for (let h = 9; h <= 16; h++) {
        hourlyMap.set(h, {
          hour: h,
          wins: 0,
          losses: 0,
          totalPnL: 0,
          tradeCount: 0,
          winRate: 0,
        });
      }

      // Process trades
      trades.forEach(trade => {
        const tradeDate = new Date(trade.executed_at);
        const hour = tradeDate.getHours();
        
        // Only count market hours
        if (hour >= 9 && hour <= 16) {
          const existing = hourlyMap.get(hour)!;
          existing.tradeCount++;
          existing.totalPnL += trade.profit_loss || 0;
          
          if ((trade.profit_loss || 0) > 0) {
            existing.wins++;
          } else {
            existing.losses++;
          }
        }
      });

      // Calculate win rates
      hourlyMap.forEach(data => {
        if (data.tradeCount > 0) {
          data.winRate = (data.wins / data.tradeCount) * 100;
        }
      });

      setHourlyData(Array.from(hourlyMap.values()));
    } catch (error) {
      console.error('Error loading time data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const stats = useMemo(() => {
    if (hourlyData.length === 0) return null;

    const hoursWithTrades = hourlyData.filter(h => h.tradeCount > 0);
    if (hoursWithTrades.length === 0) return null;

    const bestHour = hoursWithTrades.reduce((best, curr) => 
      curr.winRate > best.winRate ? curr : best
    );

    const worstHour = hoursWithTrades.reduce((worst, curr) => 
      curr.winRate < worst.winRate ? curr : worst
    );

    const mostProfitableHour = hoursWithTrades.reduce((best, curr) => 
      curr.totalPnL > best.totalPnL ? curr : best
    );

    return { bestHour, worstHour, mostProfitableHour };
  }, [hourlyData]);

  const formatHour = (hour: number) => {
    if (hour === 12) return '12 PM';
    if (hour > 12) return `${hour - 12} PM`;
    return `${hour} AM`;
  };

  const getHeatColor = (winRate: number, tradeCount: number) => {
    if (tradeCount === 0) return 'bg-muted/20';
    if (winRate >= 70) return 'bg-success/40';
    if (winRate >= 55) return 'bg-success/20';
    if (winRate >= 45) return 'bg-muted/40';
    if (winRate >= 30) return 'bg-destructive/20';
    return 'bg-destructive/40';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Time of Day Performance
        </CardTitle>
        <CardDescription>
          Analyze when you trade best during market hours
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : hourlyData.filter(h => h.tradeCount > 0).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No trade data available</p>
            <p className="text-sm">Complete some trades to see your time patterns</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Heatmap Grid */}
            <div className="grid grid-cols-8 gap-2">
              {hourlyData.map((data) => (
                <div
                  key={data.hour}
                  className={`p-3 rounded-lg text-center ${getHeatColor(data.winRate, data.tradeCount)} transition-all hover:scale-105`}
                  title={`${formatHour(data.hour)}: ${data.tradeCount} trades, ${data.winRate.toFixed(0)}% win rate, $${data.totalPnL.toFixed(0)} P&L`}
                >
                  <p className="text-xs font-medium text-muted-foreground">{formatHour(data.hour)}</p>
                  <p className="text-lg font-bold">
                    {data.tradeCount > 0 ? `${data.winRate.toFixed(0)}%` : '-'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.tradeCount} trades
                  </p>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-success/40" />
                <span>70%+</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-success/20" />
                <span>55-70%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-muted/40" />
                <span>45-55%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-destructive/20" />
                <span>30-45%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-destructive/40" />
                <span>&lt;30%</span>
              </div>
            </div>

            {/* Insights */}
            {stats && (
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                <div className="p-3 bg-success/10 rounded-lg border border-success/20">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-success" />
                    <span className="text-xs text-muted-foreground">Best Hour</span>
                  </div>
                  <p className="font-bold text-success">{formatHour(stats.bestHour.hour)}</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.bestHour.winRate.toFixed(0)}% win rate
                  </p>
                </div>

                <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="w-4 h-4 text-destructive" />
                    <span className="text-xs text-muted-foreground">Worst Hour</span>
                  </div>
                  <p className="font-bold text-destructive">{formatHour(stats.worstHour.hour)}</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.worstHour.winRate.toFixed(0)}% win rate
                  </p>
                </div>

                <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Most Profitable</span>
                  </div>
                  <p className="font-bold text-primary">{formatHour(stats.mostProfitableHour.hour)}</p>
                  <p className="text-xs text-muted-foreground">
                    ${stats.mostProfitableHour.totalPnL.toFixed(0)} P&L
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
