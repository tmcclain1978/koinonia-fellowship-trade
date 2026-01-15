import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { 
  Flame, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Trophy,
  Coffee,
  Timer,
  RefreshCw,
  BellOff
} from "lucide-react";

interface StreakData {
  currentStreak: number;
  streakType: 'winning' | 'losing' | 'none';
  longestWinStreak: number;
  longestLoseStreak: number;
  todayWins: number;
  todayLosses: number;
  consecutiveLosses: number;
}

interface StreakTrackerProps {
  userId?: string;
  onBreakSuggested?: () => void;
  compact?: boolean;
}

export const StreakTracker = ({
  userId,
  onBreakSuggested,
  compact = false,
}: StreakTrackerProps) => {
  const [streakData, setStreakData] = useState<StreakData>({
    currentStreak: 0,
    streakType: 'none',
    longestWinStreak: 0,
    longestLoseStreak: 0,
    todayWins: 0,
    todayLosses: 0,
    consecutiveLosses: 0,
  });
  const [showBreakDialog, setShowBreakDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [breakTimerActive, setBreakTimerActive] = useState(false);
  const [breakTimeRemaining, setBreakTimeRemaining] = useState(0);
  
  // Break notification preference (persisted to localStorage)
  const [breakNotificationsEnabled, setBreakNotificationsEnabled] = useState(() => {
    const saved = localStorage.getItem('streak-break-notifications');
    return saved !== 'false'; // Default to enabled
  });

  const handleBreakNotificationToggle = (enabled: boolean) => {
    setBreakNotificationsEnabled(enabled);
    localStorage.setItem('streak-break-notifications', String(enabled));
  };

  // Fetch streak data from trades
  const fetchStreakData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch today's paper trades - only completed trades (with profit_loss)
      // This counts round-trip trades (entry+exit = 1 trade)
      const { data: trades } = await supabase
        .from('paper_trades')
        .select('*')
        .gte('executed_at', today)
        .not('profit_loss', 'is', null)
        .order('executed_at', { ascending: false });

      if (!trades || trades.length === 0) {
        setStreakData({
          currentStreak: 0,
          streakType: 'none',
          longestWinStreak: 0,
          longestLoseStreak: 0,
          todayWins: 0,
          todayLosses: 0,
          consecutiveLosses: 0,
        });
        return;
      }

      // Calculate streaks
      let currentStreak = 0;
      let streakType: 'winning' | 'losing' | 'none' = 'none';
      let consecutiveLosses = 0;
      let todayWins = 0;
      let todayLosses = 0;
      let longestWinStreak = 0;
      let longestLoseStreak = 0;
      let tempWinStreak = 0;
      let tempLoseStreak = 0;

      trades.forEach((trade, index) => {
        const isWin = (trade.profit_loss || 0) > 0;
        
        if (isWin) {
          todayWins++;
          tempWinStreak++;
          if (tempWinStreak > longestWinStreak) longestWinStreak = tempWinStreak;
          tempLoseStreak = 0;
        } else {
          todayLosses++;
          tempLoseStreak++;
          if (tempLoseStreak > longestLoseStreak) longestLoseStreak = tempLoseStreak;
          tempWinStreak = 0;
        }

        // Track current streak (most recent trades)
        if (index === 0) {
          streakType = isWin ? 'winning' : 'losing';
          currentStreak = 1;
          consecutiveLosses = isWin ? 0 : 1;
        } else if (
          (streakType === 'winning' && isWin) ||
          (streakType === 'losing' && !isWin)
        ) {
          currentStreak++;
          if (!isWin) consecutiveLosses++;
        }
      });

      setStreakData({
        currentStreak,
        streakType,
        longestWinStreak,
        longestLoseStreak,
        todayWins,
        todayLosses,
        consecutiveLosses,
      });

      // Show break dialog after 3 consecutive losses (only if notifications are enabled)
      if (consecutiveLosses >= 3 && !breakTimerActive && breakNotificationsEnabled) {
        setShowBreakDialog(true);
        onBreakSuggested?.();
      }
    } catch (error) {
      console.error('Error fetching streak data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStreakData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStreakData, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  // Break timer countdown
  useEffect(() => {
    if (!breakTimerActive || breakTimeRemaining <= 0) return;

    const timer = setInterval(() => {
      setBreakTimeRemaining((prev) => {
        if (prev <= 1) {
          setBreakTimerActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [breakTimerActive, breakTimeRemaining]);

  const startBreak = (minutes: number) => {
    setBreakTimeRemaining(minutes * 60);
    setBreakTimerActive(true);
    setShowBreakDialog(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const winRate = (streakData.todayWins + streakData.todayLosses) > 0
    ? (streakData.todayWins / (streakData.todayWins + streakData.todayLosses)) * 100
    : 0;

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg text-sm">
        {streakData.streakType === 'winning' ? (
          <Badge className="gap-1 bg-green-500/20 text-green-500 border-green-500/30">
            <Flame className="w-3 h-3" />
            {streakData.currentStreak} Win Streak
          </Badge>
        ) : streakData.streakType === 'losing' ? (
          <Badge variant="destructive" className="gap-1">
            <TrendingDown className="w-3 h-3" />
            {streakData.currentStreak} Loss Streak
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1">
            No streak
          </Badge>
        )}
        
        <span className="text-muted-foreground">
          Today: <span className="text-green-500">{streakData.todayWins}W</span> / <span className="text-red-500">{streakData.todayLosses}L</span>
        </span>

        {breakTimerActive && (
          <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-500">
            <Timer className="w-3 h-3" />
            Break: {formatTime(breakTimeRemaining)}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-lg">
            <div className="flex items-center gap-2">
              {streakData.streakType === 'winning' ? (
                <Flame className="w-5 h-5 text-orange-500" />
              ) : streakData.streakType === 'losing' ? (
                <TrendingDown className="w-5 h-5 text-red-500" />
              ) : (
                <Trophy className="w-5 h-5 text-primary" />
              )}
              <span>Performance Streak</span>
              {loading && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={fetchStreakData}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardTitle>
          {/* Break notification toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {breakNotificationsEnabled ? (
                <Coffee className="w-4 h-4" />
              ) : (
                <BellOff className="w-4 h-4" />
              )}
              <Label htmlFor="break-notifications" className="text-xs cursor-pointer">
                Break Reminders
              </Label>
            </div>
            <Switch
              id="break-notifications"
              checked={breakNotificationsEnabled}
              onCheckedChange={handleBreakNotificationToggle}
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Current Streak Display */}
          <div className={`p-4 rounded-lg border ${
            streakData.streakType === 'winning' 
              ? 'bg-green-500/10 border-green-500/30' 
              : streakData.streakType === 'losing'
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-muted/50 border-border/50'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Current Streak</p>
                <p className="text-3xl font-bold font-mono">
                  {streakData.currentStreak}
                  <span className="text-lg ml-1">
                    {streakData.streakType === 'winning' ? 'Wins' : 
                     streakData.streakType === 'losing' ? 'Losses' : '-'}
                  </span>
                </p>
              </div>
              {streakData.streakType === 'winning' && streakData.currentStreak >= 3 && (
                <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white">
                  🔥 On Fire!
                </Badge>
              )}
              {streakData.consecutiveLosses >= 3 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Consider a break
                </Badge>
              )}
            </div>
          </div>

          {/* Today's Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-center gap-2 text-green-500">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm font-medium">Wins</span>
              </div>
              <p className="text-2xl font-bold font-mono text-green-500">{streakData.todayWins}</p>
            </div>
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-center gap-2 text-red-500">
                <TrendingDown className="w-4 h-4" />
                <span className="text-sm font-medium">Losses</span>
              </div>
              <p className="text-2xl font-bold font-mono text-red-500">{streakData.todayLosses}</p>
            </div>
          </div>

          {/* Win Rate */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Today's Win Rate</span>
              <span className="font-mono font-medium">{winRate.toFixed(1)}%</span>
            </div>
            <Progress 
              value={winRate} 
              className={`h-2 ${winRate >= 50 ? '' : '[&>div]:bg-red-500'}`}
            />
          </div>

          {/* Record Streaks */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
            <div>
              <p className="text-xs text-muted-foreground">Longest Win Streak</p>
              <p className="text-lg font-bold font-mono text-green-500">
                {streakData.longestWinStreak}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Longest Lose Streak</p>
              <p className="text-lg font-bold font-mono text-red-500">
                {streakData.longestLoseStreak}
              </p>
            </div>
          </div>

          {/* Break Timer */}
          {breakTimerActive && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-yellow-500">
                  <Coffee className="w-4 h-4" />
                  <span className="font-medium">Break Time</span>
                </div>
                <span className="text-2xl font-mono font-bold text-yellow-500">
                  {formatTime(breakTimeRemaining)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Take this time to reset mentally before your next trade.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setBreakTimerActive(false);
                  setBreakTimeRemaining(0);
                }}
              >
                End Break Early
              </Button>
            </div>
          )}

          {/* Manual Break Button */}
          {!breakTimerActive && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowBreakDialog(true)}
            >
              <Coffee className="w-4 h-4 mr-2" />
              Take a Break
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Break Suggestion Dialog */}
      <Dialog open={showBreakDialog} onOpenChange={setShowBreakDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Take a Break
            </DialogTitle>
            <DialogDescription className="space-y-2">
              {streakData.consecutiveLosses >= 3 ? (
                <p>
                  You've had <strong>{streakData.consecutiveLosses} consecutive losses</strong>. 
                  Taking a break can help you reset mentally and avoid emotional trading.
                </p>
              ) : (
                <p>
                  Stepping away from the charts periodically helps maintain focus and discipline.
                </p>
              )}
              <p className="text-sm">
                Research shows that traders who take regular breaks have better long-term performance.
              </p>
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-3 py-4">
            <Button variant="outline" onClick={() => startBreak(5)}>
              5 min
            </Button>
            <Button variant="outline" onClick={() => startBreak(15)}>
              15 min
            </Button>
            <Button variant="outline" onClick={() => startBreak(30)}>
              30 min
            </Button>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowBreakDialog(false)}>
              Continue Trading
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
