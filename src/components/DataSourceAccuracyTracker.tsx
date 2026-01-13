import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Brain, 
  LineChart, 
  Activity, 
  Newspaper, 
  Lightbulb, 
  Search,
  TrendingUp,
  TrendingDown,
  Trophy,
  BarChart3,
  Target
} from "lucide-react";

interface SourceStats {
  source: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  totalTrades: number;
  profitableTrades: number;
  accuracy: number;
  avgProfitFactor: number;
  avgConfidence: number;
}

interface PerformanceLog {
  id: string;
  symbol: string;
  strategy: string;
  entry_price: number;
  exit_price: number | null;
  profit_factor: number | null;
  actual_rr: number | null;
  koinonia_signal_used: boolean | null;
  chart_analysis_used: boolean | null;
  live_price_at_entry: number | null;
  sentiment_at_entry: string | null;
  screener_match_score: number | null;
  analysis_sources: string[] | null;
  trade_opened_at: string;
  trade_closed_at: string | null;
}

const DATA_SOURCES = [
  { key: "live_quotes", label: "Live Prices", icon: Activity, color: "bg-blue-500" },
  { key: "koinonia_indicator", label: "Koinonia Indicator", icon: Brain, color: "bg-purple-500" },
  { key: "chart_analysis", label: "Chart Analysis", icon: LineChart, color: "bg-orange-500" },
  { key: "news_sentiment", label: "News Sentiment", icon: Newspaper, color: "bg-green-500" },
  { key: "ai_trade_suggestions", label: "AI Trade Suggestions", icon: Lightbulb, color: "bg-yellow-500" },
  { key: "ai_stock_analysis", label: "AI Stock Analysis", icon: Search, color: "bg-pink-500" },
];

const DataSourceAccuracyTracker = () => {
  const [sourceStats, setSourceStats] = useState<SourceStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalTrades, setTotalTrades] = useState(0);
  const [overallAccuracy, setOverallAccuracy] = useState(0);

  useEffect(() => {
    loadAccuracyData();
  }, []);

  const loadAccuracyData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: logs, error } = await supabase
        .from("bot_performance_log")
        .select("*")
        .eq("user_id", session.user.id)
        .not("exit_price", "is", null);

      if (error) throw error;

      if (!logs || logs.length === 0) {
        setLoading(false);
        return;
      }

      const performanceLogs = logs as PerformanceLog[];
      setTotalTrades(performanceLogs.length);

      // Calculate stats for each data source
      const stats: SourceStats[] = DATA_SOURCES.map(source => {
        // Find trades where this source was used
        const tradesWithSource = performanceLogs.filter(log => {
          // Check various ways a source might be tracked
          if (source.key === "koinonia_indicator") {
            return log.koinonia_signal_used === true || log.analysis_sources?.includes(source.key);
          }
          if (source.key === "chart_analysis") {
            return log.chart_analysis_used === true || log.analysis_sources?.includes(source.key);
          }
          if (source.key === "live_quotes") {
            return log.live_price_at_entry !== null || log.analysis_sources?.includes(source.key);
          }
          if (source.key === "news_sentiment") {
            return (log.sentiment_at_entry && log.sentiment_at_entry !== "neutral") || log.analysis_sources?.includes(source.key);
          }
          return log.analysis_sources?.includes(source.key);
        });

        // Calculate profitable trades (where exit > entry for buys, or profit_factor > 1)
        const profitableTrades = tradesWithSource.filter(log => {
          if (log.profit_factor !== null) {
            return log.profit_factor > 1;
          }
          if (log.actual_rr !== null) {
            return log.actual_rr > 0;
          }
          if (log.exit_price && log.entry_price) {
            // Assume buy trades - profitable if exit > entry
            return log.exit_price > log.entry_price;
          }
          return false;
        });

        const accuracy = tradesWithSource.length > 0 
          ? (profitableTrades.length / tradesWithSource.length) * 100 
          : 0;

        const avgProfitFactor = tradesWithSource.length > 0
          ? tradesWithSource.reduce((sum, log) => sum + (log.profit_factor || 1), 0) / tradesWithSource.length
          : 0;

        const avgConfidence = tradesWithSource.length > 0
          ? tradesWithSource.reduce((sum, log) => sum + (log.screener_match_score || 0), 0) / tradesWithSource.length
          : 0;

        return {
          source: source.key,
          label: source.label,
          icon: source.icon,
          color: source.color,
          totalTrades: tradesWithSource.length,
          profitableTrades: profitableTrades.length,
          accuracy,
          avgProfitFactor,
          avgConfidence,
        };
      });

      // Sort by accuracy (highest first)
      stats.sort((a, b) => b.accuracy - a.accuracy);
      setSourceStats(stats);

      // Calculate overall accuracy
      const allProfitable = performanceLogs.filter(log => {
        if (log.profit_factor !== null) return log.profit_factor > 1;
        if (log.actual_rr !== null) return log.actual_rr > 0;
        if (log.exit_price && log.entry_price) return log.exit_price > log.entry_price;
        return false;
      });
      setOverallAccuracy((allProfitable.length / performanceLogs.length) * 100);

    } catch (error) {
      console.error("Error loading accuracy data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return <Badge className="bg-yellow-500 text-yellow-950"><Trophy className="w-3 h-3 mr-1" /> #1</Badge>;
    if (index === 1) return <Badge className="bg-gray-400 text-gray-900">#2</Badge>;
    if (index === 2) return <Badge className="bg-amber-700 text-amber-100">#3</Badge>;
    return <Badge variant="outline">#{index + 1}</Badge>;
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 70) return "text-success";
    if (accuracy >= 50) return "text-yellow-500";
    return "text-destructive";
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Data Source Accuracy Tracker
          </CardTitle>
          <CardDescription>Loading historical accuracy data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-2 w-full" />
                </div>
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (totalTrades === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Data Source Accuracy Tracker
          </CardTitle>
          <CardDescription>Historical accuracy of each data source</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No completed trades yet</p>
            <p className="text-sm">Accuracy data will appear after trades are closed</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Data Source Accuracy Tracker
            </CardTitle>
            <CardDescription>
              Historical accuracy ranked by profitable trade prediction
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Overall Accuracy</div>
            <div className={`text-2xl font-bold ${getAccuracyColor(overallAccuracy)}`}>
              {overallAccuracy.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">{totalTrades} trades</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sourceStats.map((stat, index) => {
            const IconComponent = stat.icon;
            return (
              <div 
                key={stat.source} 
                className={`p-4 rounded-lg border ${index === 0 ? 'border-yellow-500/50 bg-yellow-500/5' : ''}`}
              >
                <div className="flex items-center gap-4">
                  {/* Icon and Rank */}
                  <div className={`w-12 h-12 rounded-full ${stat.color} bg-opacity-20 flex items-center justify-center`}>
                    <IconComponent className={`w-6 h-6 ${stat.color.replace('bg-', 'text-')}`} />
                  </div>
                  
                  {/* Source Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{stat.label}</span>
                      {getRankBadge(index)}
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="relative">
                      <Progress value={stat.accuracy} className="h-2" />
                    </div>
                    
                    {/* Stats Row */}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-success" />
                        {stat.profitableTrades} profitable
                      </span>
                      <span className="flex items-center gap-1">
                        <TrendingDown className="w-3 h-3 text-destructive" />
                        {stat.totalTrades - stat.profitableTrades} unprofitable
                      </span>
                      <span>
                        Avg PF: {stat.avgProfitFactor.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Accuracy Score */}
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${getAccuracyColor(stat.accuracy)}`}>
                      {stat.accuracy.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {stat.totalTrades} trades
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <h4 className="text-sm font-medium mb-2">How Accuracy is Calculated</h4>
          <p className="text-xs text-muted-foreground">
            Accuracy = (Profitable Trades ÷ Total Trades) × 100%. A trade is considered profitable 
            if the exit price is higher than entry (for buy trades) or if the profit factor is greater than 1.
            Sources are ranked by their ability to predict profitable outcomes.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default DataSourceAccuracyTracker;
