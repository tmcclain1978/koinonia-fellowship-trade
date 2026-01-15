import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  TrendingUp, TrendingDown, Minus, Target, CheckCircle2, 
  XCircle, Clock, BarChart3, Brain, RefreshCw, Loader2 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

interface PredictionLog {
  id: string;
  symbol: string;
  predicted_at: string;
  predicted_direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  predicted_high: number;
  predicted_low: number;
  key_level: number;
  reasoning: string | null;
  actual_open: number | null;
  actual_high: number | null;
  actual_low: number | null;
  actual_close: number | null;
  direction_correct: boolean | null;
  high_accuracy_pct: number | null;
  low_accuracy_pct: number | null;
  overall_score: number | null;
  evaluated_at: string | null;
  trading_date: string;
}

interface AIPredictionTrackerProps {
  userId?: string;
  symbol?: string;
}

export const AIPredictionTracker = ({ userId, symbol }: AIPredictionTrackerProps) => {
  const [predictions, setPredictions] = useState<PredictionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPredictions: 0,
    evaluatedPredictions: 0,
    avgOverallScore: 0,
    directionAccuracy: 0,
    avgHighAccuracy: 0,
    avgLowAccuracy: 0,
    bullishAccuracy: 0,
    bearishAccuracy: 0,
  });

  const [evaluating, setEvaluating] = useState(false);

  const fetchPredictions = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from('ai_prediction_logs')
        .select('*')
        .eq('user_id', userId)
        .order('predicted_at', { ascending: false })
        .limit(50);
      
      if (symbol) {
        query = query.eq('symbol', symbol);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      
      // Type assertion to handle the response
      const typedData = (data || []) as unknown as PredictionLog[];
      setPredictions(typedData);
      calculateStats(typedData);
    } catch (error) {
      console.error('Error fetching predictions:', error);
      toast.error('Failed to load prediction history');
    } finally {
      setLoading(false);
    }
  };

  const evaluatePendingPredictions = async () => {
    if (!userId) return;
    
    setEvaluating(true);
    try {
      const { data, error } = await supabase.functions.invoke('evaluate-ai-predictions', {
        body: { userId }
      });
      
      if (error) throw error;
      
      if (data?.evaluated > 0) {
        toast.success(`Evaluated ${data.evaluated} predictions`);
        // Refresh the predictions list
        await fetchPredictions();
      } else {
        toast.info('No predictions ready for evaluation yet');
      }
    } catch (error) {
      console.error('Error evaluating predictions:', error);
      toast.error('Failed to evaluate predictions');
    } finally {
      setEvaluating(false);
    }
  };

  const calculateStats = (data: PredictionLog[]) => {
    const evaluated = data.filter(p => p.evaluated_at !== null);
    
    if (evaluated.length === 0) {
      setStats({
        totalPredictions: data.length,
        evaluatedPredictions: 0,
        avgOverallScore: 0,
        directionAccuracy: 0,
        avgHighAccuracy: 0,
        avgLowAccuracy: 0,
        bullishAccuracy: 0,
        bearishAccuracy: 0,
      });
      return;
    }

    const directionCorrectCount = evaluated.filter(p => p.direction_correct).length;
    const avgOverall = evaluated.reduce((sum, p) => sum + (p.overall_score || 0), 0) / evaluated.length;
    const avgHigh = evaluated.reduce((sum, p) => sum + (p.high_accuracy_pct || 0), 0) / evaluated.length;
    const avgLow = evaluated.reduce((sum, p) => sum + (p.low_accuracy_pct || 0), 0) / evaluated.length;

    const bullishPredictions = evaluated.filter(p => p.predicted_direction === 'bullish');
    const bearishPredictions = evaluated.filter(p => p.predicted_direction === 'bearish');
    
    const bullishCorrect = bullishPredictions.filter(p => p.direction_correct).length;
    const bearishCorrect = bearishPredictions.filter(p => p.direction_correct).length;

    setStats({
      totalPredictions: data.length,
      evaluatedPredictions: evaluated.length,
      avgOverallScore: Math.round(avgOverall * 10) / 10,
      directionAccuracy: Math.round((directionCorrectCount / evaluated.length) * 100),
      avgHighAccuracy: Math.round(avgHigh * 10) / 10,
      avgLowAccuracy: Math.round(avgLow * 10) / 10,
      bullishAccuracy: bullishPredictions.length > 0 
        ? Math.round((bullishCorrect / bullishPredictions.length) * 100) 
        : 0,
      bearishAccuracy: bearishPredictions.length > 0 
        ? Math.round((bearishCorrect / bearishPredictions.length) * 100) 
        : 0,
    });
  };

  useEffect(() => {
    fetchPredictions();
  }, [userId, symbol]);

  // Real-time subscription for new predictions
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('prediction-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_prediction_logs',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('Prediction update:', payload);
          fetchPredictions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'bullish': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'bearish': return <TrendingDown className="w-4 h-4 text-red-500" />;
      default: return <Minus className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-muted-foreground';
    if (score >= 70) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  if (!userId) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Sign in to track AI prediction accuracy</p>
      </Card>
    );
  }

  return (
    <Card className="bg-card/80 backdrop-blur border-primary/20">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <span className="font-semibold">AI Prediction Accuracy</span>
            {symbol && <Badge variant="outline">{symbol}</Badge>}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={fetchPredictions}
            disabled={loading}
            title="Refresh predictions"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={evaluatePendingPredictions}
            disabled={evaluating || predictions.length === 0}
            title="Evaluate past predictions"
          >
            {evaluating ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-1" />
            )}
            Evaluate
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-border">
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">{stats.avgOverallScore}%</div>
          <div className="text-xs text-muted-foreground">Overall Score</div>
          <Progress value={stats.avgOverallScore} className="h-1 mt-1" />
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-500">{stats.directionAccuracy}%</div>
          <div className="text-xs text-muted-foreground">Direction Accuracy</div>
          <Progress value={stats.directionAccuracy} className="h-1 mt-1" />
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{stats.avgHighAccuracy}%</div>
          <div className="text-xs text-muted-foreground">High Accuracy</div>
          <Progress value={stats.avgHighAccuracy} className="h-1 mt-1" />
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{stats.avgLowAccuracy}%</div>
          <div className="text-xs text-muted-foreground">Low Accuracy</div>
          <Progress value={stats.avgLowAccuracy} className="h-1 mt-1" />
        </div>
      </div>

      {/* Direction Breakdown */}
      <div className="p-4 grid grid-cols-2 gap-4 border-b border-border">
        <div className="flex items-center justify-between p-2 bg-green-500/10 rounded">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-sm">Bullish Calls</span>
          </div>
          <Badge variant="outline" className="text-green-500 border-green-500/50">
            {stats.bullishAccuracy}%
          </Badge>
        </div>
        <div className="flex items-center justify-between p-2 bg-red-500/10 rounded">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <span className="text-sm">Bearish Calls</span>
          </div>
          <Badge variant="outline" className="text-red-500 border-red-500/50">
            {stats.bearishAccuracy}%
          </Badge>
        </div>
      </div>

      {/* Prediction History */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Recent Predictions</span>
          <span className="text-xs text-muted-foreground">
            {stats.evaluatedPredictions}/{stats.totalPredictions} evaluated
          </span>
        </div>
        
        <ScrollArea className="h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : predictions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Brain className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="font-medium">No predictions yet</p>
              <p className="text-xs mt-1">Use the Koinonia AI Indicator to generate signals.</p>
              <p className="text-xs mt-1">Each signal will be logged and tracked for accuracy.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {predictions.map((prediction) => (
                <div 
                  key={prediction.id}
                  className="p-3 bg-muted/30 rounded-lg border border-border/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {prediction.symbol}
                      </Badge>
                      {getDirectionIcon(prediction.predicted_direction)}
                      <span className="text-sm capitalize">{prediction.predicted_direction}</span>
                      <Badge variant="secondary" className="text-xs">
                        {prediction.confidence}% conf
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {prediction.evaluated_at ? (
                        prediction.direction_correct ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )
                      ) : (
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className={`font-mono font-bold ${getScoreColor(prediction.overall_score)}`}>
                        {prediction.overall_score !== null ? `${prediction.overall_score}%` : 'Pending'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Predicted: </span>
                      <span className="font-mono">
                        ${prediction.predicted_low.toFixed(2)} - ${prediction.predicted_high.toFixed(2)}
                      </span>
                    </div>
                    {prediction.actual_high !== null && (
                      <div>
                        <span className="text-muted-foreground">Actual: </span>
                        <span className="font-mono">
                          ${prediction.actual_low?.toFixed(2)} - ${prediction.actual_high?.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="text-right text-muted-foreground">
                      {format(new Date(prediction.predicted_at), 'MMM d, h:mm a')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </Card>
  );
};
