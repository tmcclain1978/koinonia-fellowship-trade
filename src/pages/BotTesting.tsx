import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navigation from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Activity, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Clock, DollarSign, Target } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface BotSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  mode: string;
  total_trades: number;
  successful_trades: number;
  failed_trades: number;
  total_pnl: number;
}

interface BotDecision {
  id: string;
  symbol: string;
  decision_type: string;
  confidence: number;
  reasoning: string;
  executed: boolean;
  created_at: string;
  execution_result: any;
}

interface PerformanceMetric {
  portfolio_value: number;
  cash_balance: number;
  positions_count: number;
  daily_pnl: number;
  total_pnl: number;
  win_rate: number;
  timestamp: string;
}

const BotTesting = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [currentSession, setCurrentSession] = useState<BotSession | null>(null);
  const [recentDecisions, setRecentDecisions] = useState<BotDecision[]>([]);
  const [latestMetrics, setLatestMetrics] = useState<PerformanceMetric | null>(null);
  const [allSessions, setAllSessions] = useState<BotSession[]>([]);

  useEffect(() => {
    checkAuth();
    loadDashboardData();
    setupRealtimeSubscriptions();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load current active session
      const { data: sessions } = await supabase
        .from('bot_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(1);

      if (sessions && sessions.length > 0) {
        setCurrentSession(sessions[0]);

        // Load recent decisions for current session
        const { data: decisions } = await supabase
          .from('bot_decisions')
          .select('*')
          .eq('session_id', sessions[0].id)
          .order('created_at', { ascending: false })
          .limit(10);

        setRecentDecisions(decisions || []);

        // Load latest metrics for current session
        const { data: metrics } = await supabase
          .from('bot_performance_metrics')
          .select('*')
          .eq('session_id', sessions[0].id)
          .order('timestamp', { ascending: false })
          .limit(1);

        if (metrics && metrics.length > 0) {
          setLatestMetrics(metrics[0]);
        }
      }

      // Load all sessions
      const { data: allSessionsData } = await supabase
        .from('bot_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(5);

      setAllSessions(allSessionsData || []);

    } catch (error) {
      console.error('Error loading dashboard:', error);
      toast({
        title: "Error",
        description: "Failed to load bot testing dashboard",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscriptions = () => {
    const sessionsChannel = supabase
      .channel('bot-sessions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bot_sessions'
        },
        () => loadDashboardData()
      )
      .subscribe();

    const decisionsChannel = supabase
      .channel('bot-decisions-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bot_decisions'
        },
        () => loadDashboardData()
      )
      .subscribe();

    const metricsChannel = supabase
      .channel('bot-metrics-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bot_performance_metrics'
        },
        () => loadDashboardData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(decisionsChannel);
      supabase.removeChannel(metricsChannel);
    };
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Activity className="h-4 w-4 text-green-500 animate-pulse" />;
      case 'stopped':
        return <Clock className="h-4 w-4 text-gray-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getDecisionIcon = (type: string) => {
    switch (type) {
      case 'buy':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'sell':
      case 'close':
        return <TrendingDown className="h-4 w-4 text-destructive" />;
      default:
        return <Target className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <Activity className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">AI Bot Testing Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor your trading bot's performance and decisions in real-time
          </p>
        </div>

        {/* Current Session Status */}
        {currentSession ? (
          <div className="grid gap-6 md:grid-cols-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Status</CardTitle>
                {getStatusIcon(currentSession.status)}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold capitalize">{currentSession.status}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {currentSession.mode === 'paper' ? 'Paper Trading' : 'Live Trading'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Trades</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{currentSession.total_trades}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {currentSession.successful_trades} successful
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {currentSession.total_trades > 0
                    ? ((currentSession.successful_trades / currentSession.total_trades) * 100).toFixed(1)
                    : '0'}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {currentSession.failed_trades} failed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${currentSession.total_pnl >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                  ${currentSession.total_pnl.toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Since {formatDistanceToNow(new Date(currentSession.started_at))} ago
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>No Active Session</CardTitle>
              <CardDescription>
                The trading bot is not currently running. Start it from the Trading Bot page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate('/trading-bot')}>
                Go to Trading Bot
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Latest Performance Metrics */}
        {latestMetrics && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Current Portfolio Metrics</CardTitle>
              <CardDescription>Latest performance snapshot</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Portfolio Value</p>
                  <p className="text-2xl font-bold">${latestMetrics.portfolio_value?.toFixed(2) || '0.00'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cash Balance</p>
                  <p className="text-2xl font-bold">${latestMetrics.cash_balance?.toFixed(2) || '0.00'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Open Positions</p>
                  <p className="text-2xl font-bold">{latestMetrics.positions_count || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Daily P&L</p>
                  <p className={`text-2xl font-bold ${(latestMetrics.daily_pnl || 0) >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                    ${latestMetrics.daily_pnl?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Win Rate</p>
                  <p className="text-2xl font-bold">{latestMetrics.win_rate?.toFixed(1) || '0'}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent AI Decisions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Recent AI Decisions</CardTitle>
            <CardDescription>
              Latest trading signals and analysis from the AI bot
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentDecisions.length > 0 ? (
              <div className="space-y-4">
                {recentDecisions.map((decision) => (
                  <div
                    key={decision.id}
                    className="flex items-start gap-4 p-4 border rounded-lg"
                  >
                    <div className="mt-1">
                      {getDecisionIcon(decision.decision_type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{decision.symbol}</span>
                          <Badge variant={decision.executed ? "default" : "secondary"}>
                            {decision.decision_type.toUpperCase()}
                          </Badge>
                          {decision.executed && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(decision.created_at))} ago
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {decision.reasoning}
                      </p>
                      {decision.confidence && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Confidence:</span>
                          <div className="flex-1 bg-secondary rounded-full h-2 max-w-xs">
                            <div
                              className="bg-primary h-2 rounded-full"
                              style={{ width: `${decision.confidence}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium">{decision.confidence.toFixed(0)}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No decisions yet. The bot will log decisions here as it analyzes the market.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Session History */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Sessions</CardTitle>
            <CardDescription>Historical bot runs</CardDescription>
          </CardHeader>
          <CardContent>
            {allSessions.length > 0 ? (
              <div className="space-y-3">
                {allSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(session.status)}
                      <div>
                        <p className="font-medium">
                          {new Date(session.started_at).toLocaleString()}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {session.mode === 'paper' ? 'Paper' : 'Live'} • {session.total_trades} trades
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${session.total_pnl >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                        ${session.total_pnl.toFixed(2)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {session.total_trades > 0
                          ? `${((session.successful_trades / session.total_trades) * 100).toFixed(0)}% win rate`
                          : 'No trades'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No session history yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BotTesting;