import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Flame, AlertTriangle, Trophy, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TradeResult {
  id: string;
  profit_loss: number | null;
  executed_at: string;
  symbol: string;
}

interface StreakData {
  currentStreak: number;
  streakType: 'win' | 'loss' | 'none';
  maxWinStreak: number;
  maxLossStreak: number;
  recentTrades: TradeResult[];
  isLoading: boolean;
}

export const PerformanceStreakTracker = () => {
  const [streakData, setStreakData] = useState<StreakData>({
    currentStreak: 0,
    streakType: 'none',
    maxWinStreak: 0,
    maxLossStreak: 0,
    recentTrades: [],
    isLoading: true,
  });

  useEffect(() => {
    loadStreakData();
  }, []);

  const loadStreakData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch trades with profit/loss data
      const { data: trades } = await supabase
        .from('paper_trades')
        .select('id, profit_loss, executed_at, symbol')
        .eq('user_id', session.user.id)
        .not('profit_loss', 'is', null)
        .order('executed_at', { ascending: false })
        .limit(100);

      if (!trades || trades.length === 0) {
        setStreakData(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Calculate current streak
      let currentStreak = 0;
      let streakType: 'win' | 'loss' | 'none' = 'none';
      
      for (const trade of trades) {
        const isWin = (trade.profit_loss ?? 0) > 0;
        if (currentStreak === 0) {
          streakType = isWin ? 'win' : 'loss';
          currentStreak = 1;
        } else if ((streakType === 'win' && isWin) || (streakType === 'loss' && !isWin)) {
          currentStreak++;
        } else {
          break;
        }
      }

      // Calculate max streaks
      let maxWinStreak = 0;
      let maxLossStreak = 0;
      let tempWinStreak = 0;
      let tempLossStreak = 0;

      // Process in chronological order for max streaks
      const chronologicalTrades = [...trades].reverse();
      for (const trade of chronologicalTrades) {
        const isWin = (trade.profit_loss ?? 0) > 0;
        if (isWin) {
          tempWinStreak++;
          tempLossStreak = 0;
          maxWinStreak = Math.max(maxWinStreak, tempWinStreak);
        } else {
          tempLossStreak++;
          tempWinStreak = 0;
          maxLossStreak = Math.max(maxLossStreak, tempLossStreak);
        }
      }

      setStreakData({
        currentStreak,
        streakType,
        maxWinStreak,
        maxLossStreak,
        recentTrades: trades.slice(0, 10),
        isLoading: false,
      });
    } catch (error) {
      console.error('Error loading streak data:', error);
      setStreakData(prev => ({ ...prev, isLoading: false }));
    }
  };

  const showRevengeWarning = streakData.streakType === 'loss' && streakData.currentStreak >= 3;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-500" />
          Trading Streak
        </CardTitle>
      </CardHeader>
      <CardContent>
        {streakData.isLoading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current Streak Display */}
            <div className={`p-4 rounded-lg border ${
              streakData.streakType === 'win' 
                ? 'bg-success/10 border-success/20' 
                : streakData.streakType === 'loss'
                ? 'bg-destructive/10 border-destructive/20'
                : 'bg-muted/30 border-border'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {streakData.streakType === 'win' ? (
                    <TrendingUp className="w-8 h-8 text-success" />
                  ) : streakData.streakType === 'loss' ? (
                    <TrendingDown className="w-8 h-8 text-destructive" />
                  ) : (
                    <Target className="w-8 h-8 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Current Streak</p>
                    <p className={`text-3xl font-bold ${
                      streakData.streakType === 'win' ? 'text-success' : 
                      streakData.streakType === 'loss' ? 'text-destructive' : 'text-foreground'
                    }`}>
                      {streakData.currentStreak} {streakData.streakType === 'win' ? 'Wins' : streakData.streakType === 'loss' ? 'Losses' : 'N/A'}
                    </p>
                  </div>
                </div>
                {streakData.streakType === 'win' && streakData.currentStreak >= 3 && (
                  <Badge variant="default" className="bg-success">
                    <Flame className="w-3 h-3 mr-1" />
                    On Fire!
                  </Badge>
                )}
              </div>
            </div>

            {/* Revenge Trading Warning */}
            {showRevengeWarning && (
              <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
                  <div>
                    <p className="font-semibold text-destructive">Revenge Trading Alert</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      You've had {streakData.currentStreak} consecutive losses. Consider taking a break 
                      to avoid emotional trading decisions. Deep breath, and remember your strategy.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Max Streaks */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-success/5 rounded-lg border border-success/10">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="w-4 h-4 text-success" />
                  <span className="text-xs text-muted-foreground">Best Win Streak</span>
                </div>
                <p className="text-2xl font-bold text-success">{streakData.maxWinStreak}</p>
              </div>
              <div className="p-3 bg-destructive/5 rounded-lg border border-destructive/10">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="w-4 h-4 text-destructive" />
                  <span className="text-xs text-muted-foreground">Worst Loss Streak</span>
                </div>
                <p className="text-2xl font-bold text-destructive">{streakData.maxLossStreak}</p>
              </div>
            </div>

            {/* Recent Trades Visual */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Last 10 Trades</p>
              <div className="flex gap-1">
                {streakData.recentTrades.map((trade, idx) => (
                  <div
                    key={trade.id}
                    className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${
                      (trade.profit_loss ?? 0) > 0 
                        ? 'bg-success/20 text-success' 
                        : 'bg-destructive/20 text-destructive'
                    }`}
                    title={`${trade.symbol}: $${trade.profit_loss?.toFixed(2)}`}
                  >
                    {(trade.profit_loss ?? 0) > 0 ? 'W' : 'L'}
                  </div>
                ))}
                {streakData.recentTrades.length === 0 && (
                  <span className="text-sm text-muted-foreground">No trades yet</span>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
