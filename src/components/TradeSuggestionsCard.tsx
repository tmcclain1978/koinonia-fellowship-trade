import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, TrendingDown, Sparkles, RefreshCw } from "lucide-react";

interface Suggestion {
  symbol: string;
  action: "BUY" | "SELL";
  confidence: number;
  targetPrice: number;
  reasoning: string;
}

const TradeSuggestionsCard = () => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSuggestions();
  }, []);

  const loadSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-trade-suggestions");

      if (error) throw error;

      if (data.suggestions) {
        setSuggestions(data.suggestions);
      }
    } catch (error: any) {
      console.error("Error loading suggestions:", error);
      toast({
        title: "Error",
        description: "Failed to load study scenarios",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getDirectionLabel = (action: string) => action === "BUY" ? "Bullish Scenario" : "Bearish Scenario";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle>AI Study Scenarios</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadSuggestions}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <CardDescription>
          AI-generated educational scenarios for study and analysis practice — not trading advice
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && suggestions.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Generating study scenarios...</p>
          </div>
        ) : suggestions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No scenarios available. Click refresh to generate new study scenarios.
          </p>
        ) : (
          <div className="space-y-4">
            {suggestions.map((suggestion, idx) => (
              <div
                key={idx}
                className="border rounded-lg p-4 space-y-3 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      suggestion.action === 'BUY' ? 'bg-success/10' : 'bg-destructive/10'
                    }`}>
                      {suggestion.action === 'BUY' ? (
                        <TrendingUp className="w-5 h-5 text-success" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-destructive" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground text-lg">
                        {getDirectionLabel(suggestion.action)}: {suggestion.symbol}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Study Level: ${suggestion.targetPrice}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">AI Score</div>
                    <div className="font-bold text-foreground">
                      {suggestion.confidence}%
                    </div>
                  </div>
                </div>
                
                <div className="text-sm text-muted-foreground bg-muted/50 rounded p-3">
                  {suggestion.reasoning}
                </div>

                <Button variant="outline" size="sm" className="w-full">
                  Study This Scenario
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 p-3 bg-warning/10 rounded-lg border border-warning/20">
          <p className="text-sm text-warning">
            <strong>Educational Use Only:</strong> These are AI-generated hypothetical scenarios for learning purposes. 
            They are not investment recommendations. Always conduct your own research and consult a qualified 
            financial advisor before making any trading decisions.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default TradeSuggestionsCard;
