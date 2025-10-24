import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, TrendingDown, Activity, BarChart3 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const { toast } = useToast();

  useEffect(() => {
    loadPatterns();
  }, [selectedPair]);

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

  const executeTrade = async (pattern: Pattern) => {
    try {
      const { error } = await supabase.functions.invoke("execute-pocketoption-trade", {
        body: {
          pair: pattern.pair,
          direction: pattern.predicted_direction,
          amount: 10, // Default amount
          duration: 60, // 60 seconds
        },
      });

      if (error) throw error;

      toast({
        title: "Trade executed",
        description: `${pattern.predicted_direction.toUpperCase()} position opened on ${pattern.pair}`,
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
          <CardTitle>Pattern Recognition Engine</CardTitle>
          <CardDescription>
            AI-powered pattern detection for OTC pairs with repeating behaviors
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
            <Button onClick={analyzePattern} disabled={analyzing}>
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
                      <Button onClick={() => executeTrade(pattern)} size="sm">
                        Execute Trade
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
    </div>
  );
};

export default PocketOptionPatternEngine;
