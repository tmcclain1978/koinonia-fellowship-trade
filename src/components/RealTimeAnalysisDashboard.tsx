import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeToFixed } from "@/lib/safeNumber";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Brain, 
  LineChart, 
  Activity, 
  Newspaper, 
  Lightbulb, 
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
interface LivePrice {
  bid: number;
  ask: number;
  last: number;
  volume: number;
}

interface KoinoniaSignal {
  direction: string;
  confidence: number;
  patterns: string[];
  rsi: number;
  ema9: number;
  ema20: number;
  sentiment: string;
  sentimentScore: number;
}

interface ChartAnalysis {
  supportLevels: number[];
  resistanceLevels: number[];
  bounceZones: any[];
  keyLevel: number;
  predictedDirection: string;
}

interface TradeSuggestion {
  symbol: string;
  action: string;
  confidence: number;
  targetPrice: number;
  reasoning: string;
}

interface StockAnalysis {
  symbol: string;
  analysis: string;
  recommendation?: string;
}

interface SymbolAnalysis {
  symbol: string;
  livePrice: LivePrice | null;
  koinoniaSignal: KoinoniaSignal | null;
  chartAnalysis: ChartAnalysis | null;
  tradeSuggestion: TradeSuggestion | null;
  stockAnalysis: StockAnalysis | null;
  compositeScore: number;
  analysisSourcesUsed: string[];
  recommendation: string;
}

interface RealTimeAnalysisDashboardProps {
  watchlistSymbols?: string[];
}

const DATA_SOURCE_CONFIG = {
  live_quotes: { label: "Live Prices", icon: Activity, color: "text-blue-500" },
  koinonia_indicator: { label: "Koinonia", icon: Brain, color: "text-purple-500" },
  chart_analysis: { label: "Chart Analysis", icon: LineChart, color: "text-orange-500" },
  news_sentiment: { label: "News Sentiment", icon: Newspaper, color: "text-green-500" },
  ai_trade_suggestions: { label: "Trade Suggestions", icon: Lightbulb, color: "text-yellow-500" },
  ai_stock_analysis: { label: "Stock Analysis", icon: Search, color: "text-pink-500" },
};

const RealTimeAnalysisDashboard = ({ watchlistSymbols }: RealTimeAnalysisDashboardProps) => {
  const { toast } = useToast();
  const [analyses, setAnalyses] = useState<SymbolAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [symbols, setSymbols] = useState<string[]>(watchlistSymbols || []);

  const loadWatchlist = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get user's watchlist or default symbols
      const { data } = await supabase
        .from("user_watchlist")
        .select("symbol")
        .eq("user_id", session.user.id);

      if (data && data.length > 0) {
        setSymbols(data.map(w => w.symbol));
      } else {
        // Default watchlist
        setSymbols(["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]);
      }
    } catch (error) {
      console.error("Error loading watchlist:", error);
    }
  };

  const fetchAnalysis = useCallback(async (retryCount = 0) => {
    if (symbols.length === 0) return;
    
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const response = await supabase.functions.invoke("enhanced-bot-analysis", {
        body: { userId: session.user.id, symbols }
      });

      if (response.error) throw response.error;

      if (response.data?.allAnalysis) {
        setAnalyses(response.data.allAnalysis);
        setLastUpdated(new Date());
      }
    } catch (error: any) {
      console.error("Error fetching analysis:", error);
      
      // Retry up to 2 times on network errors
      const isNetworkError = error.message?.includes("Failed to fetch") || 
                             error.context?.message?.includes("Failed to fetch");
      
      if (isNetworkError && retryCount < 2) {
        console.log(`Retrying analysis fetch (attempt ${retryCount + 2})...`);
        setTimeout(() => fetchAnalysis(retryCount + 1), 2000);
        return;
      }
      
      // Only show toast if we've exhausted retries or it's not a network error
      if (!isNetworkError || retryCount >= 2) {
        toast({
          title: "Error fetching analysis",
          description: isNetworkError 
            ? "Network issue - please check your connection and try again" 
            : (error.message || "Failed to load analysis data"),
          variant: "destructive",
        });
      }
    } finally {
      if (retryCount === 0 || retryCount >= 2) {
        setLoading(false);
      }
    }
  }, [symbols, toast]);

  useEffect(() => {
    if (!watchlistSymbols || watchlistSymbols.length === 0) {
      loadWatchlist();
    }
  }, [watchlistSymbols]);

  useEffect(() => {
    if (symbols.length > 0) {
      fetchAnalysis();
    }
  }, [symbols, fetchAnalysis]);

  // Auto-refresh every 30 seconds (faster refresh cycle)
  useEffect(() => {
    const interval = setInterval(() => {
      if (symbols.length > 0) {
        fetchAnalysis();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [symbols, fetchAnalysis]);

  const getDirectionIcon = (direction: string) => {
    switch (direction?.toLowerCase()) {
      case "bullish":
        return <TrendingUp className="w-4 h-4 text-success" />;
      case "bearish":
        return <TrendingDown className="w-4 h-4 text-destructive" />;
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-success bg-success/10";
    if (score >= 75) return "text-primary bg-primary/10";
    if (score >= 60) return "text-yellow-500 bg-yellow-500/10";
    return "text-muted-foreground bg-muted";
  };

  const getRecommendationBadge = (recommendation: string) => {
    switch (recommendation) {
      case "strong_buy_signal":
        return <Badge className="bg-success text-success-foreground">Strong Signal</Badge>;
      case "moderate_signal":
        return <Badge className="bg-primary text-primary-foreground">Moderate Signal</Badge>;
      case "weak_signal":
        return <Badge variant="secondary">Weak Signal</Badge>;
      default:
        return <Badge variant="outline">Pass</Badge>;
    }
  };

  if (loading && analyses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 animate-pulse" />
            Real-Time Analysis Dashboard
          </CardTitle>
          <CardDescription>Loading analysis data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-24" />
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {[1, 2, 3, 4, 5, 6].map((j) => (
                    <Skeleton key={j} className="h-16" />
                  ))}
                </div>
              </div>
            ))}
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
              <Activity className="w-5 h-5" />
              Real-Time Analysis Dashboard
            </CardTitle>
            <CardDescription>
              Live analysis from all 6 data sources for your watchlist
              {lastUpdated && (
                <span className="ml-2 text-xs">
                  • Last updated: {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => fetchAnalysis()}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {analyses.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No symbols in your watchlist</p>
            <p className="text-sm">Add symbols to see real-time analysis</p>
          </div>
        ) : (
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-4">
              {analyses.map((analysis) => (
                <div 
                  key={analysis.symbol} 
                  className={`border rounded-lg p-4 ${
                    analysis.compositeScore >= 90 ? 'border-success/50 bg-success/5' : ''
                  }`}
                >
                  {/* Header Row */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold">{analysis.symbol}</span>
                      {analysis.livePrice && (
                        <span className="text-lg font-semibold text-foreground">
                          ${safeToFixed(analysis.livePrice.last, 2, 'N/A')}
                        </span>
                      )}
                      {getDirectionIcon(analysis.koinoniaSignal?.direction || analysis.chartAnalysis?.predictedDirection || "")}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`px-3 py-1 rounded-full font-bold ${getScoreColor(analysis.compositeScore)}`}>
                        {safeToFixed(analysis.compositeScore, 0, '0')}%
                      </div>
                      {getRecommendationBadge(analysis.recommendation)}
                    </div>
                  </div>

                  {/* Confidence Bar */}
                  <div className="mb-4">
                    <Progress value={analysis.compositeScore} className="h-2" />
                  </div>

                  {/* Data Sources Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    {/* Live Price */}
                    <div className={`p-3 rounded-lg ${analysis.livePrice ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-muted'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Activity className={`w-4 h-4 ${analysis.livePrice ? 'text-blue-500' : 'text-muted-foreground'}`} />
                        <span className="text-xs font-medium">Live Price</span>
                        {analysis.livePrice ? (
                          <CheckCircle className="w-3 h-3 text-success ml-auto" />
                        ) : (
                          <XCircle className="w-3 h-3 text-muted-foreground ml-auto" />
                        )}
                      </div>
                      {analysis.livePrice ? (
                        <div className="text-sm">
                          <div className="font-semibold">${safeToFixed(analysis.livePrice.last, 2, 'N/A')}</div>
                          <div className="text-xs text-muted-foreground">
                            Vol: {safeToFixed((analysis.livePrice.volume || 0) / 1000000, 1, '0')}M
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">No data</div>
                      )}
                    </div>

                    {/* Koinonia */}
                    <div className={`p-3 rounded-lg ${analysis.koinoniaSignal ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-muted'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Brain className={`w-4 h-4 ${analysis.koinoniaSignal ? 'text-purple-500' : 'text-muted-foreground'}`} />
                        <span className="text-xs font-medium">Koinonia</span>
                        {analysis.koinoniaSignal ? (
                          <CheckCircle className="w-3 h-3 text-success ml-auto" />
                        ) : (
                          <XCircle className="w-3 h-3 text-muted-foreground ml-auto" />
                        )}
                      </div>
                      {analysis.koinoniaSignal ? (
                        <div className="text-sm">
                          <div className="font-semibold capitalize flex items-center gap-1">
                            {getDirectionIcon(analysis.koinoniaSignal.direction)}
                            {analysis.koinoniaSignal.direction || 'N/A'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            RSI: {safeToFixed(analysis.koinoniaSignal.rsi, 0, 'N/A')}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">No signal</div>
                      )}
                    </div>

                    {/* Chart Analysis */}
                    <div className={`p-3 rounded-lg ${analysis.chartAnalysis ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-muted'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <LineChart className={`w-4 h-4 ${analysis.chartAnalysis ? 'text-orange-500' : 'text-muted-foreground'}`} />
                        <span className="text-xs font-medium">Chart</span>
                        {analysis.chartAnalysis ? (
                          <CheckCircle className="w-3 h-3 text-success ml-auto" />
                        ) : (
                          <XCircle className="w-3 h-3 text-muted-foreground ml-auto" />
                        )}
                      </div>
                      {analysis.chartAnalysis ? (
                        <div className="text-sm">
                          <div className="font-semibold capitalize flex items-center gap-1">
                            {getDirectionIcon(analysis.chartAnalysis.predictedDirection)}
                            {analysis.chartAnalysis.predictedDirection}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Key: ${safeToFixed(analysis.chartAnalysis.keyLevel, 2, 'N/A')}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">No data</div>
                      )}
                    </div>

                    {/* News Sentiment */}
                    <div className={`p-3 rounded-lg ${analysis.koinoniaSignal?.sentiment !== "neutral" ? 'bg-green-500/10 border border-green-500/20' : 'bg-muted'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Newspaper className={`w-4 h-4 ${analysis.koinoniaSignal?.sentiment !== "neutral" ? 'text-green-500' : 'text-muted-foreground'}`} />
                        <span className="text-xs font-medium">Sentiment</span>
                        {analysis.koinoniaSignal?.sentiment !== "neutral" ? (
                          <CheckCircle className="w-3 h-3 text-success ml-auto" />
                        ) : (
                          <XCircle className="w-3 h-3 text-muted-foreground ml-auto" />
                        )}
                      </div>
                      {analysis.koinoniaSignal?.sentiment ? (
                        <div className="text-sm">
                          <div className="font-semibold capitalize flex items-center gap-1">
                            {getDirectionIcon(analysis.koinoniaSignal.sentiment)}
                            {analysis.koinoniaSignal.sentiment}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Score: {safeToFixed(analysis.koinoniaSignal.sentimentScore, 0, '0')}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">Neutral</div>
                      )}
                    </div>

                    {/* Trade Suggestions */}
                    <div className={`p-3 rounded-lg ${analysis.tradeSuggestion ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-muted'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Lightbulb className={`w-4 h-4 ${analysis.tradeSuggestion ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                        <span className="text-xs font-medium">Suggestions</span>
                        {analysis.tradeSuggestion ? (
                          <CheckCircle className="w-3 h-3 text-success ml-auto" />
                        ) : (
                          <XCircle className="w-3 h-3 text-muted-foreground ml-auto" />
                        )}
                      </div>
                      {analysis.tradeSuggestion ? (
                        <div className="text-sm">
                          <div className="font-semibold">
                            {analysis.tradeSuggestion.action}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {analysis.tradeSuggestion.confidence}% conf
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">No suggestion</div>
                      )}
                    </div>

                    {/* Stock Analysis */}
                    <div className={`p-3 rounded-lg ${analysis.stockAnalysis ? 'bg-pink-500/10 border border-pink-500/20' : 'bg-muted'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Search className={`w-4 h-4 ${analysis.stockAnalysis ? 'text-pink-500' : 'text-muted-foreground'}`} />
                        <span className="text-xs font-medium">Analysis</span>
                        {analysis.stockAnalysis ? (
                          <CheckCircle className="w-3 h-3 text-success ml-auto" />
                        ) : (
                          <XCircle className="w-3 h-3 text-muted-foreground ml-auto" />
                        )}
                      </div>
                      {analysis.stockAnalysis ? (
                        <div className="text-sm">
                          <div className="font-semibold">
                            {analysis.stockAnalysis.recommendation || "NEUTRAL"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate" title={analysis.stockAnalysis.analysis}>
                            {analysis.stockAnalysis.analysis?.slice(0, 30)}...
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">No analysis</div>
                      )}
                    </div>
                  </div>

                  {/* Patterns detected */}
                  {analysis.koinoniaSignal?.patterns && analysis.koinoniaSignal.patterns.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {analysis.koinoniaSignal.patterns.map((pattern, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {pattern}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default RealTimeAnalysisDashboard;
