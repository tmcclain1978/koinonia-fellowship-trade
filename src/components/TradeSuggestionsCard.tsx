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
        description: "Failed to load trade suggestions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle>AI Trade Suggestions</CardTitle>
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
          AI-powered recommendations based on current market analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && suggestions.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-sm text-muted-foreground">Analyzing markets...</p>
          </div>
        ) : suggestions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No suggestions available. Click refresh to generate new recommendations.
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
                        {suggestion.action} {suggestion.symbol}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Target: ${suggestion.targetPrice}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Confidence</div>
                    <div className="font-bold text-foreground">
                      {suggestion.confidence}%
                    </div>
                  </div>
                </div>
                
                <div className="text-sm text-muted-foreground bg-muted/50 rounded p-3">
                  {suggestion.reasoning}
                </div>

                <Button variant="outline" size="sm" className="w-full">
                  View Analysis
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 p-3 bg-warning/10 rounded-lg border border-warning/20">
          <p className="text-sm text-warning">
            <strong>Disclaimer:</strong> These are AI-generated suggestions for educational purposes. 
            Always do your own research before making trading decisions.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default TradeSuggestionsCard;