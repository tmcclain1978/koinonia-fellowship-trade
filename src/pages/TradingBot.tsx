import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Bot, Play, Pause, TrendingUp, TrendingDown, Activity, ArrowLeft, Target, Brain, LineChart, Newspaper, CheckCircle, XCircle, FlaskConical, Zap, Lightbulb, Search } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import AutoTradingSettings from "@/components/AutoTradingSettings";
import Navigation from "@/components/Navigation";
import RealTimeAnalysisDashboard from "@/components/RealTimeAnalysisDashboard";

interface Trade {
  id: string;
  symbol: string;
  action: string;
  quantity: number;
  price: number;
  reasoning: string;
  executed_at: string;
  status: string;
}

interface PerformanceLog {
  id: string;
  symbol: string;
  strategy: string;
  entry_price: number;
  discipline_score: number | null;
  koinonia_signal_used: boolean | null;
  chart_analysis_used: boolean | null;
  live_price_at_entry: number | null;
  screener_match_score: number | null;
  patterns_detected: string[] | null;
  sentiment_at_entry: string | null;
  confidence_breakdown: any | null;
  analysis_sources: string[] | null;
  trade_opened_at: string;
}

interface BotStats {
  totalTrades: number;
  successRate: number;
  profitLoss: number;
  todayTrades: number;
  avgConfidence: number;
  koinoniaUsageRate: number;
  chartAnalysisUsageRate: number;
}

const TradingBot = () => {
  const navigate = useNavigate();
  const { subscription } = useSubscription();
  const { toast } = useToast();
  const [botEnabled, setBotEnabled] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [performanceLogs, setPerformanceLogs] = useState<PerformanceLog[]>([]);
  const [tradingMode, setTradingMode] = useState<"paper" | "live">("paper");
  const [showLiveConfirmDialog, setShowLiveConfirmDialog] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [stats, setStats] = useState<BotStats>({
    totalTrades: 0,
    successRate: 0,
    profitLoss: 0,
    todayTrades: 0,
    avgConfidence: 0,
    koinoniaUsageRate: 0,
    chartAnalysisUsageRate: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
    loadBotStatus();
    loadTradingMode();
    loadTrades();
    loadPerformanceLogs();
    loadStats();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const loadBotStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data } = await supabase
        .from("auto_trading_settings")
        .select("enabled")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (data) {
        setBotEnabled(data.enabled);
      }
    } catch (error) {
      console.error("Error loading bot status:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTradingMode = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data } = await supabase
        .from("user_api_credentials")
        .select("trading_mode")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (data?.trading_mode) {
        setTradingMode(data.trading_mode as "paper" | "live");
      }
    } catch (error) {
      console.error("Error loading trading mode:", error);
    }
  };

  const handleTradingModeToggle = (checked: boolean) => {
    if (checked) {
      // Switching to live - show confirmation dialog
      setShowLiveConfirmDialog(true);
      setConfirmText("");
    } else {
      // Switching to paper - no confirmation needed
      updateTradingMode("paper");
    }
  };

  const confirmLiveTrading = async () => {
    if (confirmText !== "CONFIRM") return;
    
    await updateTradingMode("live");
    setShowLiveConfirmDialog(false);
    setConfirmText("");
  };

  const updateTradingMode = async (mode: "paper" | "live") => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from("user_api_credentials")
        .upsert({
          user_id: session.user.id,
          trading_mode: mode,
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      setTradingMode(mode);
      toast({
        title: `Trading Mode: ${mode === "paper" ? "Paper" : "Live"}`,
        description: mode === "paper" 
          ? "Bot will execute simulated trades only" 
          : "⚠️ Bot will execute real trades with your broker",
        variant: mode === "live" ? "destructive" : "default",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadTrades = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data } = await supabase
        .from("auto_trades_log")
        .select("*")
        .eq("user_id", session.user.id)
        .order("executed_at", { ascending: false })
        .limit(20);

      if (data) {
        setTrades(data);
      }
    } catch (error) {
      console.error("Error loading trades:", error);
    }
  };

  const loadPerformanceLogs = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data } = await supabase
        .from("bot_performance_log")
        .select("*")
        .eq("user_id", session.user.id)
        .order("trade_opened_at", { ascending: false })
        .limit(10);

      if (data) {
        setPerformanceLogs(data as PerformanceLog[]);
      }
    } catch (error) {
      console.error("Error loading performance logs:", error);
    }
  };

  const loadStats = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: allTrades } = await supabase
        .from("auto_trades_log")
        .select("*")
        .eq("user_id", session.user.id);

      const { data: perfLogs } = await supabase
        .from("bot_performance_log")
        .select("*")
        .eq("user_id", session.user.id);

      if (allTrades) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayTrades = allTrades.filter(
          (t) => new Date(t.executed_at) >= today
        ).length;

        const executedTrades = allTrades.filter((t) => t.status === "executed");
        const successRate = executedTrades.length > 0
          ? (executedTrades.length / allTrades.length) * 100
          : 0;

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

        // Mock P&L calculation
        const profitLoss = executedTrades.reduce((acc) => {
          return acc + (Math.random() * 200 - 100);
        }, 0);

        setStats({
          totalTrades: allTrades.length,
          successRate: Math.round(successRate),
          profitLoss: Math.round(profitLoss),
          todayTrades,
          avgConfidence: Math.round(avgConfidence),
          koinoniaUsageRate: Math.round(koinoniaUsageRate),
          chartAnalysisUsageRate: Math.round(chartAnalysisUsageRate),
        });
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const toggleBot = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const newStatus = !botEnabled;
      
      const { error } = await supabase
        .from("auto_trading_settings")
        .upsert({
          user_id: session.user.id,
          enabled: newStatus,
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      setBotEnabled(newStatus);
      toast({
        title: newStatus ? "Bot Started" : "Bot Stopped",
        description: newStatus
          ? "The AI trading bot is now active with 90%+ confidence gate"
          : "The AI trading bot has been paused",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (subscription?.tier !== "enterprise") {
    return (
      <>
        <Navigation />
        <div className="min-h-screen bg-background pt-16 p-6">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="w-6 h-6" />
              AI Trading Bot
            </CardTitle>
            <CardDescription>
              Upgrade to Enterprise to access the AI Auto-Trading Bot
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/pricing")}>
              Upgrade to Enterprise
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
    );
  }

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background pt-16 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
                <Bot className="w-8 h-8" />
                AI Trading Bot
              </h1>
              <p className="text-muted-foreground">
                Automated trading with 90%+ confidence gate
              </p>
            </div>
          </div>

          <Button
            onClick={toggleBot}
            variant={botEnabled ? "destructive" : "default"}
            size="lg"
            disabled={loading}
          >
            {botEnabled ? (
              <>
                <Pause className="w-5 h-5 mr-2" />
                Stop Bot
              </>
            ) : (
              <>
                <Play className="w-5 h-5 mr-2" />
                Start Bot
              </>
            )}
          </Button>
        </div>

        {/* Trading Mode Toggle */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  tradingMode === "paper" ? "bg-primary/10" : "bg-destructive/10"
                }`}>
                  {tradingMode === "paper" ? (
                    <FlaskConical className="w-6 h-6 text-primary" />
                  ) : (
                    <Zap className="w-6 h-6 text-destructive" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Trading Mode</h3>
                  <p className="text-sm text-muted-foreground">
                    {tradingMode === "paper" 
                      ? "Simulated trades - no real money at risk" 
                      : "⚠️ Real trades - actual money will be used"}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Label htmlFor="trading-mode" className={`font-medium ${tradingMode === "paper" ? "text-primary" : "text-muted-foreground"}`}>
                  Paper
                </Label>
                <Switch
                  id="trading-mode"
                  checked={tradingMode === "live"}
                  onCheckedChange={handleTradingModeToggle}
                />
                <Label htmlFor="trading-mode" className={`font-medium ${tradingMode === "live" ? "text-destructive" : "text-muted-foreground"}`}>
                  Live
                </Label>
              </div>
            </div>
            
            {tradingMode === "live" && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive font-medium">
                  ⚠️ Live trading is enabled. Real orders will be placed with your connected broker.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Enhanced Stats Cards */}
        <div className="grid md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Trades
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {stats.totalTrades}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                {stats.successRate}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Profit/Loss
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stats.profitLoss >= 0 ? 'text-success' : 'text-destructive'}`}>
                ${stats.profitLoss >= 0 ? '+' : ''}{stats.profitLoss}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Today's Trades
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {stats.todayTrades}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Target className="w-3 h-3" />
                Avg Confidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {stats.avgConfidence}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Brain className="w-3 h-3" />
                Koinonia Used
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {stats.koinoniaUsageRate}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <LineChart className="w-3 h-3" />
                Chart Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {stats.chartAnalysisUsageRate}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Analysis Sources Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Bot Analysis Pipeline
            </CardTitle>
            <CardDescription>
              Data sources used for trading decisions (90%+ confidence required)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">Koinonia Indicator</div>
                  <div className="text-sm text-muted-foreground">Patterns & Signals</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <LineChart className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">AI Chart Analysis</div>
                  <div className="text-sm text-muted-foreground">Support/Resistance</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">Live Streaming</div>
                  <div className="text-sm text-muted-foreground">Real-time Quotes</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Newspaper className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">News Sentiment</div>
                  <div className="text-sm text-muted-foreground">Market Mood</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Lightbulb className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">AI Trade Suggestions</div>
                  <div className="text-sm text-muted-foreground">Smart Picks</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Search className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">AI Stock Analysis</div>
                  <div className="text-sm text-muted-foreground">Deep Insights</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Real-Time Analysis Dashboard */}
        <RealTimeAnalysisDashboard />

        {/* Settings */}
        <AutoTradingSettings />

        {/* Recent Performance Logs */}
        {performanceLogs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Analysis Breakdown
              </CardTitle>
              <CardDescription>Recent trade analysis sources and confidence scores</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {performanceLogs.map((log) => (
                  <div key={log.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="font-semibold text-lg">{log.symbol}</div>
                        <Badge variant="outline">{log.strategy}</Badge>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Confidence Score</div>
                        <div className="font-bold text-primary">{log.screener_match_score || 0}%</div>
                      </div>
                    </div>
                    
                    {/* Confidence Progress Bar */}
                    <div className="mb-3">
                      <Progress 
                        value={log.screener_match_score || 0} 
                        className="h-2"
                      />
                    </div>

                    {/* Analysis Sources */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge 
                        variant={log.koinonia_signal_used ? "default" : "secondary"}
                        className="flex items-center gap-1"
                      >
                        {log.koinonia_signal_used ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        Koinonia
                      </Badge>
                      <Badge 
                        variant={log.chart_analysis_used ? "default" : "secondary"}
                        className="flex items-center gap-1"
                      >
                        {log.chart_analysis_used ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        Chart Analysis
                      </Badge>
                      <Badge 
                        variant={log.analysis_sources?.includes("ai_trade_suggestions") ? "default" : "secondary"}
                        className="flex items-center gap-1"
                      >
                        {log.analysis_sources?.includes("ai_trade_suggestions") ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        Trade Suggestions
                      </Badge>
                      <Badge 
                        variant={log.analysis_sources?.includes("ai_stock_analysis") ? "default" : "secondary"}
                        className="flex items-center gap-1"
                      >
                        {log.analysis_sources?.includes("ai_stock_analysis") ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        Stock Analysis
                      </Badge>
                      {log.live_price_at_entry && (
                        <Badge variant="outline">
                          Live: ${log.live_price_at_entry.toFixed(2)}
                        </Badge>
                      )}
                      {log.sentiment_at_entry && (
                        <Badge 
                          variant={log.sentiment_at_entry === "bullish" ? "default" : 
                                   log.sentiment_at_entry === "bearish" ? "destructive" : "secondary"}
                        >
                          {log.sentiment_at_entry}
                        </Badge>
                      )}
                    </div>

                    {/* Patterns Detected */}
                    {log.patterns_detected && log.patterns_detected.length > 0 && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Patterns: </span>
                        {log.patterns_detected.join(", ")}
                      </div>
                    )}

                    {/* Entry Info */}
                    <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                      <span>Entry: ${log.entry_price?.toFixed(2)}</span>
                      <span>Discipline: {((log.discipline_score || 0) * 100).toFixed(0)}%</span>
                      <span>{new Date(log.trade_opened_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Trade History */}
        <Card>
          <CardHeader>
            <CardTitle>Trade History</CardTitle>
            <CardDescription>Recent trades executed by the AI bot</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {trades.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No trades yet. Start the bot to begin trading.
                </p>
              ) : (
                trades.map((trade) => (
                  <div
                    key={trade.id}
                    className="border rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          trade.action === 'BUY' ? 'bg-success/10' : 
                          trade.action === 'pass' ? 'bg-muted' : 'bg-destructive/10'
                        }`}>
                          {trade.action === 'BUY' ? (
                            <TrendingUp className="w-5 h-5 text-success" />
                          ) : trade.action === 'pass' ? (
                            <XCircle className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <TrendingDown className="w-5 h-5 text-destructive" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">
                            {trade.action === 'pass' ? `PASS - ${trade.symbol}` : `${trade.action} ${trade.symbol}`}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(trade.executed_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {trade.action !== 'pass' && (
                          <div className="font-semibold text-foreground">
                            {trade.quantity} @ ${trade.price}
                          </div>
                        )}
                        <Badge 
                          variant={
                            trade.status === 'executed' ? 'default' :
                            trade.status === 'passed' ? 'secondary' :
                            trade.status === 'confidence_below_threshold' ? 'secondary' :
                            trade.status === 'failed' ? 'destructive' :
                            'outline'
                          }
                        >
                          {trade.status}
                        </Badge>
                      </div>
                    </div>
                    {trade.reasoning && (
                      <div className="text-sm text-muted-foreground bg-muted/50 rounded p-3">
                        <strong>AI Reasoning:</strong> {trade.reasoning}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
      {/* Live Trading Confirmation Dialog */}
      <Dialog open={showLiveConfirmDialog} onOpenChange={setShowLiveConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Zap className="w-5 h-5" />
              Enable Live Trading
            </DialogTitle>
            <DialogDescription className="text-left space-y-3 pt-2">
              <p>
                <strong className="text-destructive">⚠️ Warning:</strong> You are about to enable live trading mode.
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Real orders will be placed with your broker</li>
                <li>Real money will be at risk</li>
                <li>Trades cannot be undone once executed</li>
              </ul>
              <p className="pt-2">
                To confirm, type <strong className="font-mono bg-muted px-1 rounded">CONFIRM</strong> below:
              </p>
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-2">
            <Input
              placeholder="Type CONFIRM to enable live trading"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              className="font-mono"
            />
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowLiveConfirmDialog(false);
                setConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmLiveTrading}
              disabled={confirmText !== "CONFIRM"}
            >
              Enable Live Trading
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TradingBot;
