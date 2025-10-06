import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { Sparkles, TrendingUp, TrendingDown, Shield, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface KoinoniaSignal {
  entrySignal: {
    price: number;
    confidence: number;
    reasoning: string;
  };
  exitSignals: Array<{
    price: number;
    type: "stop_loss" | "take_profit";
    confidence: number;
  }>;
  optionStrategy: {
    type: "CALL" | "PUT";
    strike: number;
    expiration: string;
  };
  riskReward: number;
  overallConfidence: number;
  analysis: string;
}

interface KoinoniaIndicatorProps {
  symbol: string;
  onSignalGenerated?: (signal: any) => void;
}

export const KoinoniaIndicator = ({ symbol, onSignalGenerated }: KoinoniaIndicatorProps) => {
  const [loading, setLoading] = useState(false);
  const [signal, setSignal] = useState<KoinoniaSignal | null>(null);
  const { toast } = useToast();
  const { subscription, hasFeatureAccess } = useSubscription();

  const isEnterprise = subscription?.tier === "enterprise";
  const requiresPayment = !isEnterprise;

  const generateSignal = async () => {
    if (!symbol) {
      toast({
        title: "Error",
        description: "Please enter a symbol first",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to use the Koinonia Indicator",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('koinonia-indicator', {
        body: { symbol, userId: session.user.id }
      });

      if (error) throw error;

      if (data.requiresPayment && !isEnterprise) {
        toast({
          title: "Payment Required",
          description: "The Koinonia Indicator requires a $49 payment for non-enterprise users. Upgrade to Enterprise for unlimited free access!",
          variant: "destructive",
        });
        return;
      }

      setSignal(data.signals);
      if (onSignalGenerated) {
        onSignalGenerated({
          entryPrice: data.signals.entrySignal.price,
          exitPrices: data.signals.exitSignals.map((s: any) => s.price),
          stopLoss: data.signals.exitSignals.find((s: any) => s.type === 'stop_loss')?.price
        });
      }

      toast({
        title: "Signal Generated",
        description: `Koinonia Indicator analyzed ${symbol} with ${data.signals.overallConfidence}% confidence`,
      });
    } catch (error: any) {
      console.error('Error generating signal:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate signal",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>Koinonia AI Indicator</CardTitle>
            {isEnterprise ? (
              <Badge variant="default" className="ml-2">
                <Shield className="h-3 w-3 mr-1" />
                Enterprise
              </Badge>
            ) : (
              <Badge variant="secondary" className="ml-2">$49</Badge>
            )}
          </div>
        </div>
        <CardDescription>
          Proprietary AI-powered indicator using technical analysis, news sentiment, and machine learning for 90%+ accuracy
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {requiresPayment && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This premium indicator requires a $49 one-time payment or Enterprise subscription.
              Upgrade to Enterprise for unlimited free access!
            </AlertDescription>
          </Alert>
        )}

        <Button 
          onClick={generateSignal} 
          disabled={loading}
          className="w-full"
          size="lg"
        >
          {loading ? (
            "Analyzing..."
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Signal for {symbol}
            </>
          )}
        </Button>

        {signal && (
          <div className="space-y-4 mt-4 p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Trading Signal</h3>
              <Badge variant={signal.overallConfidence >= 85 ? "default" : "secondary"}>
                {signal.overallConfidence}% Confidence
              </Badge>
            </div>

            {/* Entry Signal */}
            <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <TrendingUp className="h-5 w-5 text-green-500 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-green-600">Entry Signal</div>
                <div className="text-sm text-muted-foreground">
                  Price: ${signal.entrySignal.price.toFixed(2)} ({signal.entrySignal.confidence}% confidence)
                </div>
                <div className="text-xs mt-1">{signal.entrySignal.reasoning}</div>
              </div>
            </div>

            {/* Option Strategy */}
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
              <div className="font-semibold">Recommended Strategy</div>
              <div className="text-sm text-muted-foreground">
                {signal.optionStrategy.type} - Strike: ${signal.optionStrategy.strike} - Exp: {signal.optionStrategy.expiration}
              </div>
            </div>

            {/* Exit Signals */}
            <div className="space-y-2">
              <div className="font-semibold">Exit Targets</div>
              {signal.exitSignals.map((exit, idx) => (
                <div 
                  key={idx}
                  className={`flex items-center gap-3 p-2 rounded-lg ${
                    exit.type === 'stop_loss' 
                      ? 'bg-red-500/10 border border-red-500/20' 
                      : 'bg-purple-500/10 border border-purple-500/20'
                  }`}
                >
                  <TrendingDown className={`h-4 w-4 ${
                    exit.type === 'stop_loss' ? 'text-red-500' : 'text-purple-500'
                  }`} />
                  <div className="flex-1">
                    <span className="text-sm font-medium">
                      {exit.type === 'stop_loss' ? 'Stop Loss' : `Target ${idx}`}
                    </span>
                    <span className="text-sm ml-2">${exit.price.toFixed(2)}</span>
                    <span className="text-xs text-muted-foreground ml-2">({exit.confidence}%)</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Risk/Reward */}
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-semibold">Risk/Reward Ratio</span>
                <span className="text-lg font-bold text-primary">1:{signal.riskReward.toFixed(2)}</span>
              </div>
            </div>

            {/* Analysis */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="font-semibold mb-2">AI Analysis</div>
              <div className="text-sm text-muted-foreground">{signal.analysis}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
