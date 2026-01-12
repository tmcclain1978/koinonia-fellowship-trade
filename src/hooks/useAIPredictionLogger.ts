import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ChartAnalysis {
  symbol: string;
  dailyPrediction: {
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    predictedHigh: number;
    predictedLow: number;
    keyLevelToWatch: number;
    reasoning: string;
  };
}

export const useAIPredictionLogger = () => {
  const logPrediction = useCallback(async (
    userId: string,
    analysis: ChartAnalysis
  ): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('ai_prediction_logs')
        .insert({
          user_id: userId,
          symbol: analysis.symbol,
          predicted_direction: analysis.dailyPrediction.direction,
          confidence: analysis.dailyPrediction.confidence,
          predicted_high: analysis.dailyPrediction.predictedHigh,
          predicted_low: analysis.dailyPrediction.predictedLow,
          key_level: analysis.dailyPrediction.keyLevelToWatch,
          reasoning: analysis.dailyPrediction.reasoning,
          trading_date: new Date().toISOString().split('T')[0],
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error logging prediction:', error);
        return null;
      }

      console.log('Prediction logged:', data.id);
      return data.id;
    } catch (error) {
      console.error('Failed to log prediction:', error);
      return null;
    }
  }, []);

  const evaluatePrediction = useCallback(async (
    predictionId: string,
    actualData: {
      open: number;
      high: number;
      low: number;
      close: number;
    }
  ): Promise<boolean> => {
    try {
      const { error } = await supabase.functions.invoke('evaluate-ai-predictions', {
        body: { predictionId, actualData }
      });

      if (error) throw error;

      toast.success('Prediction evaluated!');
      return true;
    } catch (error) {
      console.error('Failed to evaluate prediction:', error);
      toast.error('Failed to evaluate prediction');
      return false;
    }
  }, []);

  return {
    logPrediction,
    evaluatePrediction,
  };
};
