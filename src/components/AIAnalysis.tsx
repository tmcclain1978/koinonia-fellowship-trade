import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import FormattedAIInsight from "@/components/FormattedAIInsight";

const AIAnalysis = () => {
  const [symbol, setSymbol] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const analyzeStock = async () => {
    if (!symbol) {
      toast({
        title: "Error",
        description: "Please enter a stock symbol",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setAnalysis(null);

    try {
      // Track usage
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.functions.invoke("track-usage", {
          body: { feature: "ai_analyses", userId: session.user.id },
        });
      }

      const { data, error } = await supabase.functions.invoke("analyze-stock", {
        body: { symbol: symbol.toUpperCase(), timeframe: "day trading" },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setAnalysis(data.analysis);
      
      toast({
        title: "Analysis Complete",
        description: `AI analysis for ${symbol.toUpperCase()} is ready`,
      });
    } catch (error: any) {
      console.error("Analysis error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to analyze stock",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <div className="bg-gradient-card rounded-2xl p-8 border border-border">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-display text-xl font-semibold text-foreground">
              AI Educational Analysis
            </h3>
            <p className="text-sm text-muted-foreground">
              Study AI-generated market analysis for educational purposes only
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <Input
            type="text"
            placeholder="Enter stock symbol (e.g., AAPL, TSLA)"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onKeyPress={(e) => e.key === "Enter" && analyzeStock()}
            className="flex-1"
          />
          <Button
            onClick={analyzeStock}
            disabled={loading || !symbol}
            variant="hero"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 mr-2" />
                Analyze
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Analysis Results */}
      {analysis && (
        <div className="bg-card rounded-2xl p-8 border border-border">
          <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Analysis for {symbol.toUpperCase()}
          </h4>
          
          <FormattedAIInsight analysis={analysis} />
          
          <div className="mt-6 p-4 bg-warning/10 rounded-lg border border-warning/20">
            <p className="text-sm text-warning">
              <strong>Educational Use Only:</strong> This analysis is AI-generated for educational and informational 
              purposes only. It is not investment advice. Always conduct your own research and consult a qualified 
              financial advisor before making any trading decisions. Past performance does not guarantee future results.
            </p>
          </div>
        </div>
      )}

      {/* Quick Tips */}
      <div className="bg-card rounded-xl p-6 border border-border">
        <h4 className="font-semibold text-foreground mb-4">Quick Tips</h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• Use proper position sizing based on your account size</li>
          <li>• Always set stop-loss orders to manage risk</li>
          <li>• Don't risk more than 1-2% of your capital per trade</li>
          <li>• Review market conditions before executing trades</li>
        </ul>
      </div>
    </div>
  );
};

export default AIAnalysis;