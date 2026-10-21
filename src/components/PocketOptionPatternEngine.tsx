import { useState, useEffect, useCallback, useRef } from "react";
import { addTick, type TickCandle } from "@/lib/marketData/tickCandles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePocketOptionWebSocket } from "@/hooks/usePocketOptionWebSocket";
import { usePocketOptionCandles } from "@/hooks/usePocketOptionCandles";
import { Loader2, TrendingUp, TrendingDown, Activity, BarChart3, Wifi, WifiOff, Brain } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PocketOptionPredictionPanel from "./PocketOptionPredictionPanel";

interface Pattern {
  id: string;
  pair: string;
  pattern_type: string;
  confidence: number;
  predicted_direction: "up" | "down";
  predicted_at: string;
  expires_at: string;
  accuracy_rate: number;
}

const POPULAR_PAIRS = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "AUD/USD",
  "USD/CHF",
  "EUR/GBP",
  "EUR/JPY",
  "GBP/JPY"
];

const PocketOptionPatternEngine = () => {
  const [selectedPair, setSelectedPair] = useState(POPULAR_PAIRS[0]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [liveTradingEnabled, setLiveTradingEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("predictions");
  const { toast } = useToast();
  
  const { 
    isConnected, 
    balance, 
    prices, 
    connect, 
    disconnect, 
    executeTrade,
    changeBalanceMode,
    subscribeToCandles 
  } = usePocketOptionWebSocket();

  const {
    recentCandles,
    addCandle,
    loadCandles,
    candleCount,
  } = usePocketOptionCandles();

  // Load candle history when pair changes
  useEffect(() => {
    loadCandles(selectedPair);
  }, [selectedPair, loadCandles]);

  useEffect(() => {
    loadPatterns();
  }, [selectedPair]);

  useEffect(() => {
    // Subscribe to price updates for selected pair when connected
    if (isConnected && selectedPair) {
      const assetCode = selectedPair.replace('/', '');
      subscribeToCandles(assetCode);
    }
  }, [isConnected, selectedPair, subscribeToCandles]);

  // Build real 1-minute candles from price ticks. Each tick used to be saved
  // as its own "candle" with open = high = low = close, so the history the
  // AI prediction reads was flat lines. Now a candle is saved once its minute ends.
  const tickCandleRef = useRef<TickCandle | null>(null);
  useEffect(() => {
    tickCandleRef.current = null; // new pair or reconnect: start a fresh minute
  }, [selectedPair, isConnected]);
  useEffect(() => {
    const assetCode = selectedPair.replace('/', '');
    const price = prices[assetCode];
    if (!price || !isConnected) return;
    const { candle, finished } = addTick(tickCandleRef.current, price, Date.now());
    tickCandleRef.current = candle;
    if (finished) {
      addCandle({
        pair: selectedPair,
        timestamp: new Date(finished.start),
        open: finished.open,
        high: finished.high,
        low: finished.low,
        close: finished.close,
        timeframe: '1m',
      });
    }
  }, [prices, selectedPair, isConnected, addCandle]);

  // Handle trade execution from prediction panel
  const handleExecuteFromPrediction = useCallback((direction: 'call' | 'put', amount: number) => {
    if (!isConnected) {
      toast({
        title: "Not Connected",
        description: "Please connect to PocketOption first",
        variant: "destructive",
      });
      return;
    }

    const assetCode = selectedPair.replace('/', '');
    executeTrade({
      asset: assetCode,
      action: direction,
      amount,
      duration: 60,
    });
  }, [isConnected, selectedPair, executeTrade, toast]);

  const loadPatterns = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pocketoption_patterns")
        .select("*")
        .eq("pair", selectedPair)
        .gte("expires_at", new Date().toISOString())
        .order("confidence", { ascending: false })
        .limit(5);

      if (error) throw error;
      setPatterns((data || []) as Pattern[]);
    } catch (error: any) {
      console.error("Error loading patterns:", error);
    } finally {
      setLoading(false);
    }
  };

  const analyzePattern = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-pocketoption-pattern", {
        body: { pair: selectedPair },
      });

      if (error) throw error;
      if (data?.success === false) {
        toast({ title: "No patterns", description: data.message || "Pattern detection isn't available." });
        return;
      }

      toast({
        title: "Analysis complete",
        description: `Found ${data.patterns_detected} recurring patterns`,
      });

      await loadPatterns();
    } catch (error: any) {
      toast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExecuteTrade = async (pattern: Pattern) => {
    if (!isConnected) {
      toast({
        title: "Not Connected",
        description: "Please connect to PocketOption WebSocket first",
        variant: "destructive",
      });
      return;
    }

    try {
      const assetCode = pattern.pair.replace('/', '');
      
      executeTrade({
        asset: assetCode,
        action: pattern.predicted_direction === 'up' ? 'call' : 'put',
        amount: 10, // Default amount
        duration: 60, // 60 seconds
      });

      toast({
        title: "Trade Sent",
        description: `${pattern.predicted_direction.toUpperCase()} position for ${pattern.pair}`,
      });
    } catch (error: any) {
      toast({
        title: "Trade failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Pattern Recognition Engine</span>
            <div className="flex items-center gap-3">
              <Badge variant={isConnected ? "default" : "secondary"}>
                {isConnected ? (
                  <>
                    <Wifi className="w-3 h-3 mr-1" />
                    Connected
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 mr-1" />
                    Disconnected
                  </>
                )}
              </Badge>
              {!isConnected ? (
                <Button onClick={connect} size="sm" variant="outline">
                  Connect
                </Button>
              ) : (
                <Button onClick={disconnect} size="sm" variant="outline">
                  Disconnect
                </Button>
              )}
            </div>
          </CardTitle>
          <CardDescription>
            AI-powered pattern detection for OTC pairs with real-time WebSocket connection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {balance !== null && (
            <Alert>
              <Activity className="h-4 w-4" />
              <AlertDescription>
                Current Balance: <span className="font-bold">${balance.toFixed(2)}</span>
                {prices[selectedPair.replace('/', '')] && (
                  <span className="ml-4">
                    {selectedPair}: <span className="font-bold">${prices[selectedPair.replace('/', '')].toFixed(5)}</span>
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Select value={selectedPair} onValueChange={setSelectedPair}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POPULAR_PAIRS.map((pair) => (
                    <SelectItem key={pair} value={pair}>
                      {pair}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="live-trading"
                checked={liveTradingEnabled}
                onCheckedChange={(checked) => {
                  setLiveTradingEnabled(checked);
                  if (checked && isConnected) {
                    changeBalanceMode('demo');
                  }
                }}
                disabled={!isConnected}
              />
              <Label htmlFor="live-trading" className="text-sm">
                Live Trading Mode
              </Label>
            </div>
            <Button onClick={analyzePattern} disabled={analyzing || !isConnected}>
              {analyzing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <BarChart3 className="w-4 h-4 mr-2" />
              Analyze Patterns
            </Button>
          </div>

          <div className="grid gap-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Patterns Found</p>
                      <p className="text-2xl font-bold">{patterns.length}</p>
                    </div>
                    <Activity className="w-8 h-8 text-primary" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Confidence</p>
                      <p className="text-2xl font-bold">
                        {patterns.length > 0
                          ? Math.round(
                              patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
                            )
                          : 0}
                        %
                      </p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-primary" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Accuracy</p>
                      <p className="text-2xl font-bold">
                        {patterns.length > 0
                          ? Math.round(
                              patterns.reduce((sum, p) => sum + p.accuracy_rate, 0) / patterns.length
                            )
                          : 0}
                        %
                      </p>
                    </div>
                    <BarChart3 className="w-8 h-8 text-primary" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="predictions" className="flex items-center gap-2">
            <Brain className="w-4 h-4" />
            AI Predictions
          </TabsTrigger>
          <TabsTrigger value="patterns" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Active Patterns
          </TabsTrigger>
        </TabsList>

        <TabsContent value="predictions">
          <PocketOptionPredictionPanel
            pair={selectedPair}
            recentCandles={recentCandles}
            isConnected={isConnected}
            onExecuteTrade={handleExecuteFromPrediction}
            candleCount={candleCount}
          />
        </TabsContent>

        <TabsContent value="patterns">
          <Card>
            <CardHeader>
              <CardTitle>Active Patterns</CardTitle>
              <CardDescription>
                Detected patterns with high confidence for {selectedPair}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : patterns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No active patterns found for {selectedPair}</p>
                  <p className="text-sm mt-2">Click "Analyze Patterns" to detect new patterns</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {patterns.map((pattern) => (
                    <Card key={pattern.id} className="border-2">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-lg">{pattern.pair}</h3>
                              <Badge variant={pattern.predicted_direction === "up" ? "default" : "destructive"}>
                                {pattern.predicted_direction === "up" ? (
                                  <TrendingUp className="w-3 h-3 mr-1" />
                                ) : (
                                  <TrendingDown className="w-3 h-3 mr-1" />
                                )}
                                {pattern.predicted_direction.toUpperCase()}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Pattern: {pattern.pattern_type}
                            </p>
                          </div>
                          <Button 
                            onClick={() => handleExecuteTrade(pattern)} 
                            size="sm"
                            disabled={!isConnected || !liveTradingEnabled}
                          >
                            {liveTradingEnabled ? 'Execute Trade' : 'Enable Live Trading'}
                          </Button>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Confidence</span>
                              <span className="font-medium">{pattern.confidence}%</span>
                            </div>
                            <Progress value={pattern.confidence} />
                          </div>

                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Historical Accuracy</span>
                              <span className="font-medium">{pattern.accuracy_rate}%</span>
                            </div>
                            <Progress value={pattern.accuracy_rate} />
                          </div>

                          <div className="flex justify-between text-sm text-muted-foreground pt-2 border-t border-border">
                            <span>
                              Predicted: {new Date(pattern.predicted_at).toLocaleTimeString()}
                            </span>
                            <span>
                              Expires: {new Date(pattern.expires_at).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PocketOptionPatternEngine;
