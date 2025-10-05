import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Brain, TrendingUp, Target, AlertCircle, BookOpen, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BotLearning = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [performance, setPerformance] = useState<any[]>([]);
  const [strategyStats, setStrategyStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);
      loadBotData(session.user.id);
    });
  }, [navigate]);

  const loadBotData = async (userId: string) => {
    try {
      setLoading(true);

      // Load latest insights
      const { data: insightsData } = await supabase
        .from("bot_learning_insights")
        .select("*")
        .eq("user_id", userId)
        .order("insight_date", { ascending: false })
        .limit(1)
        .single();

      setInsights(insightsData);

      // Load recent performance
      const { data: perfData } = await supabase
        .from("bot_performance_log")
        .select("*")
        .eq("user_id", userId)
        .order("trade_opened_at", { ascending: false })
        .limit(10);

      setPerformance(perfData || []);

      // Load strategy stats
      const { data: statsData } = await supabase
        .from("bot_strategy_stats")
        .select("*")
        .eq("user_id", userId)
        .order("total_trades", { ascending: false });

      setStrategyStats(statsData || []);
    } catch (error) {
      console.error("Error loading bot data:", error);
      toast({
        title: "Error",
        description: "Failed to load bot learning data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-6 py-24">
          <div className="text-center">Loading bot learning data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-6 py-24">
        <div className="mb-8">
          <h1 className="text-4xl font-display font-bold mb-2">AI Trading Bot Learning</h1>
          <p className="text-muted-foreground">
            Track your bot's performance, learning progress, and coaching insights
          </p>
        </div>

        <Tabs defaultValue="insights" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="insights">
              <Brain className="w-4 h-4 mr-2" />
              Insights
            </TabsTrigger>
            <TabsTrigger value="performance">
              <BarChart3 className="w-4 h-4 mr-2" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="strategies">
              <Target className="w-4 h-4 mr-2" />
              Strategies
            </TabsTrigger>
          </TabsList>

          <TabsContent value="insights" className="space-y-6">
            {insights ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-primary" />
                      Today's Key Insights
                    </CardTitle>
                    <CardDescription>
                      Date: {new Date(insights.insight_date).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {insights.key_insights?.map((insight: string, idx: number) => (
                      <div key={idx} className="flex gap-3 p-4 bg-card-hover rounded-lg">
                        <div className="flex-shrink-0 w-6 h-6 bg-primary/20 text-primary rounded-full flex items-center justify-center text-sm font-semibold">
                          {idx + 1}
                        </div>
                        <p className="text-foreground">{insight}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <div className="grid md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-success" />
                        Strategy Adjustments
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{insights.strategy_adjustments}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-warning" />
                        Risk Observations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{insights.risk_observations}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Daily Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Trades Analyzed</p>
                        <p className="text-2xl font-bold">{insights.trades_analyzed}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">IV Accuracy</p>
                        <p className="text-2xl font-bold">
                          {(insights.iv_regime_accuracy * 100).toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground">Target: 80%</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Profit Factor</p>
                        <p className="text-2xl font-bold">
                          {insights.avg_profit_factor?.toFixed(2) || "N/A"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Discipline</p>
                        <p className="text-2xl font-bold">
                          {(insights.avg_discipline_score * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Brain className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No insights yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Your AI bot will generate learning insights after completing trades
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="performance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Performance</CardTitle>
                <CardDescription>Last 10 completed trades</CardDescription>
              </CardHeader>
              <CardContent>
                {performance.length > 0 ? (
                  <div className="space-y-3">
                    {performance.map((trade) => (
                      <div key={trade.id} className="p-4 border border-border rounded-lg space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold">{trade.symbol} - {trade.strategy}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(trade.trade_opened_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">
                              ${trade.entry_price}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Qty: {trade.quantity}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">POP</p>
                            <p className="font-medium">{(trade.pop_predicted * 100).toFixed(0)}%</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Discipline</p>
                            <p className="font-medium">{(trade.discipline_score * 100).toFixed(0)}%</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Regime</p>
                            <p className="font-medium">{trade.regime_classification}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No performance data yet
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="strategies" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Strategy Performance</CardTitle>
                <CardDescription>Win rates and statistics by strategy</CardDescription>
              </CardHeader>
              <CardContent>
                {strategyStats.length > 0 ? (
                  <div className="space-y-4">
                    {strategyStats.map((stat) => (
                      <div key={stat.id} className="p-4 border border-border rounded-lg">
                        <div className="flex justify-between items-start mb-3">
                          <h3 className="font-semibold capitalize">
                            {stat.strategy.replace(/_/g, " ")}
                          </h3>
                          <span className={`px-2 py-1 rounded text-xs ${stat.enabled ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}>
                            {stat.enabled ? "Active" : "Disabled"}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Total Trades</p>
                            <p className="text-lg font-bold">{stat.total_trades}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Win Rate</p>
                            <p className="text-lg font-bold">
                              {stat.total_trades > 0 
                                ? ((stat.winning_trades / stat.total_trades) * 100).toFixed(1)
                                : "0"}%
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Profit Factor</p>
                            <p className="text-lg font-bold">{stat.avg_profit_factor?.toFixed(2) || "N/A"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Total P&L</p>
                            <p className={`text-lg font-bold ${stat.total_pnl >= 0 ? "text-success" : "text-destructive"}`}>
                              ${stat.total_pnl?.toFixed(2) || "0.00"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No strategy data yet
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default BotLearning;
