import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  TrendingUp, 
  TrendingDown, 
  Loader2, 
  RefreshCw, 
  Target,
  Clock,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  XCircle
} from "lucide-react";
import type { Candle } from "@/hooks/usePocketOptionCandles";

interface Prediction {
  direction: 'up' | 'down';
  confidence: number;
  agreement: string;
  algorithms: Array<{
    method: string;
    direction: 'up' | 'down';
    confidence: number;
    details: string;
  }>;
  sequence: string[];
}

interface AccuracyStats {
  today: { correct: number; total: number };
  week: { correct: number; total: number };
  all: { correct: number; total: number };
}

interface PocketOptionPredictionPanelProps {
  pair: string;
  recentCandles: Candle[];
  isConnected: boolean;
  onExecuteTrade: (direction: 'call' | 'put', amount: number) => void;
  candleCount: number;
}

const PocketOptionPredictionPanel = ({
  pair,
  recentCandles,
  isConnected,
  onExecuteTrade,
  candleCount,
}: PocketOptionPredictionPanelProps) => {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<AccuracyStats>({
    today: { correct: 0, total: 0 },
    week: { correct: 0, total: 0 },
    all: { correct: 0, total: 0 },
  });
  const [countdown, setCountdown] = useState(60);
  const { toast } = useToast();

  // Fetch prediction from edge function
  const fetchPrediction = useCallback(async () => {
    if (candleCount < 10) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('predict-pocketoption-candle', {
        body: { pair, sequenceLength: 5 },
      });

      if (error) throw error;

      if (data?.success && data.prediction) {
        setPrediction(data.prediction);
        setMessage(null);
      } else {
        // Show why instead of a silent "No prediction available".
        setPrediction(null);
        setMessage(data?.message || 'The prediction service gave no answer.');
      }
    } catch (error: any) {
      setPrediction(null);
      setMessage(`Couldn't get a prediction: ${error?.message ?? error}`);
    } finally {
      setLoading(false);
    }
  }, [pair, candleCount]);

  // Load accuracy stats
  const loadAccuracyStats = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      const todayStart = new Date(now.setHours(0, 0, 0, 0)).toISOString();
      const weekStart = new Date(now.setDate(now.getDate() - 7)).toISOString();

      // Fetch all predictions with results
      const { data: predictions, error } = await supabase
        .from('pocketoption_predictions')
        .select('predicted_at, was_correct')
        .eq('user_id', user.id)
        .eq('pair', pair)
        .not('was_correct', 'is', null);

      if (error || !predictions) return;

      const stats: AccuracyStats = {
        today: { correct: 0, total: 0 },
        week: { correct: 0, total: 0 },
        all: { correct: 0, total: 0 },
      };

      for (const pred of predictions) {
        stats.all.total++;
        if (pred.was_correct) stats.all.correct++;

        if (pred.predicted_at >= todayStart) {
          stats.today.total++;
          if (pred.was_correct) stats.today.correct++;
        }

        if (pred.predicted_at >= weekStart) {
          stats.week.total++;
          if (pred.was_correct) stats.week.correct++;
        }
      }

      setAccuracy(stats);
    } catch (error) {
      console.error('Error loading accuracy:', error);
    }
  }, [pair]);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Refresh prediction when countdown reaches 0
          fetchPrediction();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [fetchPrediction]);

  // Initial load
  useEffect(() => {
    fetchPrediction();
    loadAccuracyStats();
  }, [pair, fetchPrediction, loadAccuracyStats]);

  // Handle trade execution
  const handleTrade = (direction: 'call' | 'put', amount: number) => {
    if (!isConnected) {
      toast({
        title: 'Not Connected',
        description: 'Please connect to PocketOption first',
        variant: 'destructive',
      });
      return;
    }

    onExecuteTrade(direction, amount);
    toast({
      title: 'Trade Executed',
      description: `${direction.toUpperCase()} $${amount} on ${pair}`,
    });
  };

  const formatAccuracy = (stats: { correct: number; total: number }) => {
    if (stats.total === 0) return '--';
    return `${Math.round((stats.correct / stats.total) * 100)}%`;
  };

  return (
    <div className="space-y-4">
      {/* Recent Candles Display */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>Last 10 Candles</span>
            <Badge variant="outline">{candleCount} stored</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentCandles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Waiting for candle data...
            </p>
          ) : (
            <div className="flex items-center justify-center gap-1">
              {recentCandles.map((candle, idx) => (
                <div
                  key={idx}
                  className={`w-8 h-12 rounded flex items-center justify-center ${
                    candle.direction === 'up'
                      ? 'bg-green-500/20 text-green-500'
                      : candle.direction === 'down'
                      ? 'bg-red-500/20 text-red-500'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {candle.direction === 'up' ? (
                    <ArrowUp className="w-4 h-4" />
                  ) : candle.direction === 'down' ? (
                    <ArrowDown className="w-4 h-4" />
                  ) : (
                    <span className="text-xs">-</span>
                  )}
                </div>
              ))}
              <div className="w-8 h-12 rounded bg-primary/20 text-primary flex items-center justify-center border-2 border-dashed border-primary">
                <span className="text-xs font-bold">?</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prediction Display */}
      <Card className={prediction ? (
        prediction.direction === 'up' 
          ? 'border-green-500/50 bg-green-500/5' 
          : 'border-red-500/50 bg-red-500/5'
      ) : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Prediction
            </span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono">
                <Clock className="w-3 h-3 mr-1" />
                {countdown}s
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={fetchPrediction}
                disabled={loading || candleCount < 10}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {candleCount < 10 ? (
            <div className="text-center py-6 text-muted-foreground">
              <p>Need at least 10 candles for prediction</p>
              <p className="text-sm mt-1">Currently: {candleCount} candles</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : prediction ? (
            <>
              <div className="text-center">
                <div className={`inline-flex items-center gap-3 px-6 py-4 rounded-lg ${
                  prediction.direction === 'up'
                    ? 'bg-green-500/20 text-green-500'
                    : 'bg-red-500/20 text-red-500'
                }`}>
                  {prediction.direction === 'up' ? (
                    <TrendingUp className="w-10 h-10" />
                  ) : (
                    <TrendingDown className="w-10 h-10" />
                  )}
                  <div className="text-left">
                    <div className="text-2xl font-bold uppercase">
                      {prediction.direction === 'up' ? 'CALL' : 'PUT'}
                    </div>
                    <div className="text-sm opacity-80">
                      {prediction.confidence}% confidence
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Algorithm Agreement</span>
                  <span className="font-medium">{prediction.agreement}</span>
                </div>
                <Progress value={prediction.confidence} />
              </div>

              {/* Algorithm Details */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Algorithm Breakdown:</p>
                {prediction.algorithms.map((algo, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs p-2 rounded bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      {algo.direction === 'up' ? (
                        <ArrowUp className="w-3 h-3 text-green-500" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-red-500" />
                      )}
                      <span className="capitalize">{algo.method.replace('_', ' ')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{algo.confidence}%</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Trade Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => handleTrade('call', 10)}
                  disabled={!isConnected}
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  CALL $10
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => handleTrade('call', 25)}
                  disabled={!isConnected}
                >
                  CALL $25
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  onClick={() => handleTrade('put', 10)}
                  disabled={!isConnected}
                >
                  <TrendingDown className="w-4 h-4 mr-2" />
                  PUT $10
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  onClick={() => handleTrade('put', 25)}
                  disabled={!isConnected}
                >
                  PUT $25
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <p>No prediction available</p>
              <p className="text-sm mt-1" data-testid="ai-message">{message ?? 'Click refresh to generate'}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Accuracy Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Prediction Accuracy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">
                {formatAccuracy(accuracy.today)}
              </div>
              <div className="text-xs text-muted-foreground">
                Today ({accuracy.today.correct}/{accuracy.today.total})
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {formatAccuracy(accuracy.week)}
              </div>
              <div className="text-xs text-muted-foreground">
                Week ({accuracy.week.correct}/{accuracy.week.total})
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {formatAccuracy(accuracy.all)}
              </div>
              <div className="text-xs text-muted-foreground">
                All Time ({accuracy.all.correct}/{accuracy.all.total})
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PocketOptionPredictionPanel;
