import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Bot, Play, Pause, TrendingUp, TrendingDown, Activity, DollarSign, ArrowLeft } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import AutoTradingSettings from "@/components/AutoTradingSettings";
import Navigation from "@/components/Navigation";

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

interface BotStats {
  totalTrades: number;
  successRate: number;
  profitLoss: number;
  todayTrades: number;
}

const TradingBot = () => {
  const navigate = useNavigate();
  const { subscription } = useSubscription();
  const { toast } = useToast();
  const [botEnabled, setBotEnabled] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<BotStats>({
    totalTrades: 0,
    successRate: 0,
    profitLoss: 0,
    todayTrades: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
    loadBotStatus();
    loadTrades();
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

  const loadStats = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: allTrades } = await supabase
        .from("auto_trades_log")
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

        // Mock P&L calculation - would be real in production
        const profitLoss = executedTrades.reduce((acc, trade) => {
          return acc + (Math.random() * 200 - 100); // Mock calculation
        }, 0);

        setStats({
          totalTrades: allTrades.length,
          successRate: Math.round(successRate),
          profitLoss: Math.round(profitLoss),
          todayTrades,
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
        });

      if (error) throw error;

      setBotEnabled(newStatus);
      toast({
        title: newStatus ? "Bot Started" : "Bot Stopped",
        description: newStatus
          ? "The AI trading bot is now active"
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
                Automated trading powered by AI
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

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6">
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
        </div>

        {/* Settings */}
        <AutoTradingSettings />

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
                          trade.action === 'BUY' ? 'bg-success/10' : 'bg-destructive/10'
                        }`}>
                          {trade.action === 'BUY' ? (
                            <TrendingUp className="w-5 h-5 text-success" />
                          ) : (
                            <TrendingDown className="w-5 h-5 text-destructive" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">
                            {trade.action} {trade.symbol}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(trade.executed_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-foreground">
                          {trade.quantity} @ ${trade.price}
                        </div>
                        <div className={`text-sm ${
                          trade.status === 'executed' ? 'text-success' :
                          trade.status === 'failed' ? 'text-destructive' :
                          'text-warning'
                        }`}>
                          {trade.status.toUpperCase()}
                        </div>
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
    </>
  );
};

export default TradingBot;