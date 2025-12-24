import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Newspaper, TrendingUp, TrendingDown, Minus, RefreshCw, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";

interface SentimentResult {
  symbol: string;
  overall: string;
  score: number;
  weightedScore: number;
  articlesAnalyzed: number;
  breakdown: {
    bullishPercent: number;
    bearishPercent: number;
    neutralPercent: number;
  };
  topBullish: Array<{ title: string; score: number; confidence: number }>;
  topBearish: Array<{ title: string; score: number; confidence: number }>;
  loading?: boolean;
  error?: string;
}

export const NewsSentimentDashboard = () => {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [sentimentData, setSentimentData] = useState<Record<string, SentimentResult>>({});
  const [loading, setLoading] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const { toast } = useToast();

  // Fetch user watchlist
  useEffect(() => {
    fetchWatchlist();
  }, []);

  const fetchWatchlist = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("user_watchlist")
        .select("symbol")
        .eq("user_id", session.user.id);

      if (error) throw error;

      if (data && data.length > 0) {
        const symbols = data.map(item => item.symbol);
        setWatchlist(symbols);
        // Auto-fetch sentiment for watchlist
        symbols.forEach(symbol => fetchSentimentForSymbol(symbol));
      } else {
        // Default watchlist if none exists
        const defaultWatchlist = ["AAPL", "MSFT", "GOOGL", "TSLA", "SPY"];
        setWatchlist(defaultWatchlist);
        defaultWatchlist.forEach(symbol => fetchSentimentForSymbol(symbol));
      }
    } catch (error) {
      console.error("Error fetching watchlist:", error);
      // Use default watchlist on error
      const defaultWatchlist = ["AAPL", "MSFT", "GOOGL", "TSLA", "SPY"];
      setWatchlist(defaultWatchlist);
      defaultWatchlist.forEach(symbol => fetchSentimentForSymbol(symbol));
    }
  };

  const fetchSentimentForSymbol = async (symbol: string) => {
    setSentimentData(prev => ({
      ...prev,
      [symbol]: { ...prev[symbol], symbol, loading: true } as SentimentResult
    }));

    try {
      const { data, error } = await supabase.functions.invoke("news-sentiment-scanner", {
        body: { symbol, maxArticles: 10 }
      });

      if (error) throw error;

      setSentimentData(prev => ({
        ...prev,
        [symbol]: {
          symbol,
          overall: data.overall || "Unknown",
          score: data.score || 0,
          weightedScore: data.weightedScore || 0,
          articlesAnalyzed: data.articlesAnalyzed || 0,
          breakdown: data.breakdown || { bullishPercent: 0, bearishPercent: 0, neutralPercent: 0 },
          topBullish: data.topBullish || [],
          topBearish: data.topBearish || [],
          loading: false
        }
      }));
    } catch (error: any) {
      console.error(`Error fetching sentiment for ${symbol}:`, error);
      setSentimentData(prev => ({
        ...prev,
        [symbol]: { 
          symbol, 
          loading: false, 
          error: error.message,
          overall: "Unknown",
          score: 0,
          weightedScore: 0,
          articlesAnalyzed: 0,
          breakdown: { bullishPercent: 0, bearishPercent: 0, neutralPercent: 0 },
          topBullish: [],
          topBearish: []
        }
      }));
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all(watchlist.map(symbol => fetchSentimentForSymbol(symbol)));
    setLoading(false);
    toast({
      title: "Sentiment Updated",
      description: `Refreshed sentiment data for ${watchlist.length} stocks`
    });
  };

  const addSymbol = async () => {
    if (!newSymbol.trim()) return;
    
    const symbol = newSymbol.toUpperCase().trim();
    if (watchlist.includes(symbol)) {
      toast({
        title: "Already Added",
        description: `${symbol} is already in your watchlist`,
        variant: "destructive"
      });
      return;
    }

    setWatchlist(prev => [...prev, symbol]);
    setNewSymbol("");
    fetchSentimentForSymbol(symbol);

    // Save to database
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.from("user_watchlist").insert({
          user_id: session.user.id,
          symbol
        });
      }
    } catch (error) {
      console.error("Error saving to watchlist:", error);
    }
  };

  const removeSymbol = async (symbol: string) => {
    setWatchlist(prev => prev.filter(s => s !== symbol));
    setSentimentData(prev => {
      const newData = { ...prev };
      delete newData[symbol];
      return newData;
    });

    // Remove from database
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase
          .from("user_watchlist")
          .delete()
          .eq("user_id", session.user.id)
          .eq("symbol", symbol);
      }
    } catch (error) {
      console.error("Error removing from watchlist:", error);
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment?.toLowerCase()) {
      case "bullish": return "text-green-500";
      case "bearish": return "text-red-500";
      default: return "text-muted-foreground";
    }
  };

  const getSentimentBgColor = (sentiment: string) => {
    switch (sentiment?.toLowerCase()) {
      case "bullish": return "bg-green-500/10 border-green-500/20";
      case "bearish": return "bg-red-500/10 border-red-500/20";
      default: return "bg-muted/50 border-muted";
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment?.toLowerCase()) {
      case "bullish": return <TrendingUp className="h-5 w-5 text-green-500" />;
      case "bearish": return <TrendingDown className="h-5 w-5 text-red-500" />;
      default: return <Minus className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary" />
            <CardTitle>News Sentiment Dashboard</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh All</span>
          </Button>
        </div>
        <CardDescription>
          Real-time AI-powered news sentiment analysis for your watchlist stocks
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add Symbol Input */}
        <div className="flex gap-2">
          <Input
            placeholder="Add symbol (e.g., NVDA)"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && addSymbol()}
            className="max-w-xs"
          />
          <Button onClick={addSymbol} size="icon" variant="outline">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Sentiment Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {watchlist.map((symbol) => {
            const data = sentimentData[symbol];
            
            return (
              <Card 
                key={symbol} 
                className={`relative transition-all ${data ? getSentimentBgColor(data.overall) : "bg-muted/30"}`}
              >
                <button
                  onClick={() => removeSymbol(symbol)}
                  className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors text-xs"
                >
                  ✕
                </button>
                
                <CardContent className="pt-4">
                  {data?.loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : data?.error ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-destructive">{data.error}</p>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => fetchSentimentForSymbol(symbol)}
                        className="mt-2"
                      >
                        Retry
                      </Button>
                    </div>
                  ) : data ? (
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getSentimentIcon(data.overall)}
                          <span className="font-bold text-lg">{symbol}</span>
                        </div>
                        <Badge 
                          variant={data.overall === "Bullish" ? "default" : data.overall === "Bearish" ? "destructive" : "secondary"}
                        >
                          {data.overall}
                        </Badge>
                      </div>

                      {/* Score Display */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Sentiment Score</span>
                          <span className={`font-medium ${getSentimentColor(data.overall)}`}>
                            {(data.score * 100).toFixed(1)}%
                          </span>
                        </div>
                        <Progress 
                          value={Math.abs(data.score) * 100} 
                          className="h-2"
                        />
                      </div>

                      {/* Breakdown Chart */}
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Sentiment Breakdown</p>
                        <div className="flex h-3 rounded-full overflow-hidden">
                          <div 
                            className="bg-green-500 transition-all"
                            style={{ width: `${data.breakdown.bullishPercent}%` }}
                          />
                          <div 
                            className="bg-gray-400 transition-all"
                            style={{ width: `${data.breakdown.neutralPercent}%` }}
                          />
                          <div 
                            className="bg-red-500 transition-all"
                            style={{ width: `${data.breakdown.bearishPercent}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-green-500">
                            ↑ {data.breakdown.bullishPercent?.toFixed(0)}%
                          </span>
                          <span className="text-muted-foreground">
                            — {data.breakdown.neutralPercent?.toFixed(0)}%
                          </span>
                          <span className="text-red-500">
                            ↓ {data.breakdown.bearishPercent?.toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      {/* Articles Count */}
                      <div className="text-xs text-muted-foreground text-center pt-2 border-t">
                        {data.articlesAnalyzed} articles analyzed
                      </div>

                      {/* Top Headlines Preview */}
                      {(data.topBullish.length > 0 || data.topBearish.length > 0) && (
                        <div className="pt-2 border-t space-y-1">
                          {data.topBullish[0] && (
                            <p className="text-xs text-green-500 truncate" title={data.topBullish[0].title}>
                              📈 {data.topBullish[0].title}
                            </p>
                          )}
                          {data.topBearish[0] && (
                            <p className="text-xs text-red-500 truncate" title={data.topBearish[0].title}>
                              📉 {data.topBearish[0].title}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">{symbol}</p>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => fetchSentimentForSymbol(symbol)}
                        className="mt-2"
                      >
                        Load Sentiment
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Market Overview */}
        {Object.keys(sentimentData).length > 0 && (
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <h4 className="font-semibold mb-3">Market Sentiment Overview</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">
                    {Object.values(sentimentData).filter(d => d.overall === "Bullish").length}
                  </div>
                  <div className="text-xs text-muted-foreground">Bullish</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-muted-foreground">
                    {Object.values(sentimentData).filter(d => d.overall === "Neutral").length}
                  </div>
                  <div className="text-xs text-muted-foreground">Neutral</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-500">
                    {Object.values(sentimentData).filter(d => d.overall === "Bearish").length}
                  </div>
                  <div className="text-xs text-muted-foreground">Bearish</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
};
