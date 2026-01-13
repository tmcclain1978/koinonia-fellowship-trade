import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TradingStats {
  totalTrades: number;
  successRate: number;
  profitLoss: number;
  todayTrades: number;
  avgConfidence: number;
  koinoniaUsageRate: number;
  chartAnalysisUsageRate: number;
  winningTrades: number;
  losingTrades: number;
  monthlyReturn: number;
  activeSignals: number;
  isLoading: boolean;
}

interface DashboardStats {
  successRate: number;
  activeSignals: number;
  monthlyReturn: number;
  isLoading: boolean;
}

export const useTradingStats = () => {
  const [stats, setStats] = useState<TradingStats>({
    totalTrades: 0,
    successRate: 0,
    profitLoss: 0,
    todayTrades: 0,
    avgConfidence: 0,
    koinoniaUsageRate: 0,
    chartAnalysisUsageRate: 0,
    winningTrades: 0,
    losingTrades: 0,
    monthlyReturn: 0,
    activeSignals: 0,
    isLoading: true,
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStats(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Load all trades (auto + paper)
      const [autoTradesRes, paperTradesRes, performanceRes, signalsRes, accountRes] = await Promise.all([
        supabase
          .from("auto_trades_log")
          .select("*")
          .eq("user_id", session.user.id),
        supabase
          .from("paper_trades")
          .select("*")
          .eq("user_id", session.user.id),
        supabase
          .from("bot_performance_log")
          .select("*")
          .eq("user_id", session.user.id),
        supabase
          .from("trading_signals")
          .select("*")
          .gt("expires_at", new Date().toISOString()),
        supabase
          .from("paper_trading_accounts")
          .select("*")
          .eq("user_id", session.user.id)
          .maybeSingle(),
      ]);

      const autoTrades = autoTradesRes.data || [];
      const paperTrades = paperTradesRes.data || [];
      const perfLogs = performanceRes.data || [];
      const activeSignals = signalsRes.data || [];
      const account = accountRes.data;

      // Today's date at midnight
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Calculate today's trades
      const todayAutoTrades = autoTrades.filter(
        (t) => new Date(t.executed_at) >= today
      ).length;
      const todayPaperTrades = paperTrades.filter(
        (t) => new Date(t.executed_at) >= today
      ).length;

      // Calculate total trades
      const totalTrades = autoTrades.length + paperTrades.length;

      // Calculate P&L from paper trades (actual profit_loss column)
      const paperPnL = paperTrades.reduce(
        (sum, t) => sum + (t.profit_loss || 0),
        0
      );

      // Calculate winning vs losing trades from paper trades
      const tradesWithPnL = paperTrades.filter(t => t.profit_loss !== null);
      const winningTrades = tradesWithPnL.filter(t => t.profit_loss > 0).length;
      const losingTrades = tradesWithPnL.filter(t => t.profit_loss < 0).length;

      // Success rate based on actual winning trades
      const successRate = tradesWithPnL.length > 0
        ? (winningTrades / tradesWithPnL.length) * 100
        : 0;

      // Calculate monthly return based on account data
      let monthlyReturn = 0;
      if (account) {
        const startingBalance = account.starting_balance || 100000;
        const currentBalance = account.balance || startingBalance;
        monthlyReturn = ((currentBalance - startingBalance) / startingBalance) * 100;
      }

      // Calculate enhanced stats from performance logs
      let avgConfidence = 0;
      let koinoniaUsageRate = 0;
      let chartAnalysisUsageRate = 0;

      if (perfLogs && perfLogs.length > 0) {
        const logsWithConfidence = perfLogs.filter((l: any) => l.screener_match_score);
        avgConfidence = logsWithConfidence.length > 0
          ? logsWithConfidence.reduce((acc: number, l: any) => acc + (l.screener_match_score || 0), 0) / logsWithConfidence.length
          : 0;

        koinoniaUsageRate = (perfLogs.filter((l: any) => l.koinonia_signal_used).length / perfLogs.length) * 100;
        chartAnalysisUsageRate = (perfLogs.filter((l: any) => l.chart_analysis_used).length / perfLogs.length) * 100;
      }

      setStats({
        totalTrades,
        successRate: Math.round(successRate),
        profitLoss: Math.round(paperPnL * 100) / 100,
        todayTrades: todayAutoTrades + todayPaperTrades,
        avgConfidence: Math.round(avgConfidence),
        koinoniaUsageRate: Math.round(koinoniaUsageRate),
        chartAnalysisUsageRate: Math.round(chartAnalysisUsageRate),
        winningTrades,
        losingTrades,
        monthlyReturn: Math.round(monthlyReturn * 100) / 100,
        activeSignals: activeSignals.length,
        isLoading: false,
      });
    } catch (error) {
      console.error("Error loading trading stats:", error);
      setStats(prev => ({ ...prev, isLoading: false }));
    }
  };

  return { stats, reload: loadStats };
};

export const useDashboardStats = (): DashboardStats => {
  const [stats, setStats] = useState<DashboardStats>({
    successRate: 0,
    activeSignals: 0,
    monthlyReturn: 0,
    isLoading: true,
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStats(prev => ({ ...prev, isLoading: false }));
        return;
      }

      const [paperTradesRes, signalsRes, accountRes] = await Promise.all([
        supabase
          .from("paper_trades")
          .select("profit_loss")
          .eq("user_id", session.user.id)
          .not("profit_loss", "is", null),
        supabase
          .from("trading_signals")
          .select("id")
          .gt("expires_at", new Date().toISOString()),
        supabase
          .from("paper_trading_accounts")
          .select("balance, starting_balance")
          .eq("user_id", session.user.id)
          .maybeSingle(),
      ]);

      const tradesWithPnL = paperTradesRes.data || [];
      const signals = signalsRes.data || [];
      const account = accountRes.data;

      // Calculate success rate from actual trades
      const winningTrades = tradesWithPnL.filter(t => (t.profit_loss ?? 0) > 0).length;
      const successRate = tradesWithPnL.length > 0
        ? (winningTrades / tradesWithPnL.length) * 100
        : 0;

      // Calculate monthly return
      let monthlyReturn = 0;
      if (account) {
        const startingBalance = account.starting_balance || 100000;
        const currentBalance = account.balance || startingBalance;
        monthlyReturn = ((currentBalance - startingBalance) / startingBalance) * 100;
      }

      setStats({
        successRate: Math.round(successRate),
        activeSignals: signals.length,
        monthlyReturn: Math.round(monthlyReturn * 100) / 100,
        isLoading: false,
      });
    } catch (error) {
      console.error("Error loading dashboard stats:", error);
      setStats(prev => ({ ...prev, isLoading: false }));
    }
  };

  return stats;
};
