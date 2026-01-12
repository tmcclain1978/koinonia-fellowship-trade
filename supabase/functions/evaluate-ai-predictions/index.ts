import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PredictionLog {
  id: string;
  symbol: string;
  predicted_direction: 'bullish' | 'bearish' | 'neutral';
  predicted_high: number;
  predicted_low: number;
  trading_date: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, predictionId, actualData } = await req.json();

    // If actualData is provided directly, use it
    if (actualData && predictionId) {
      const { data: prediction, error: fetchError } = await supabase
        .from('ai_prediction_logs')
        .select('*')
        .eq('id', predictionId)
        .single();

      if (fetchError || !prediction) {
        throw new Error('Prediction not found');
      }

      const evaluation = calculateAccuracy(prediction, actualData);
      
      const { error: updateError } = await supabase
        .from('ai_prediction_logs')
        .update({
          actual_open: actualData.open,
          actual_high: actualData.high,
          actual_low: actualData.low,
          actual_close: actualData.close,
          direction_correct: evaluation.directionCorrect,
          high_accuracy_pct: evaluation.highAccuracy,
          low_accuracy_pct: evaluation.lowAccuracy,
          overall_score: evaluation.overallScore,
          evaluated_at: new Date().toISOString(),
        })
        .eq('id', predictionId);

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ 
        success: true, 
        evaluation 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Otherwise, fetch unevaluated predictions for the user
    const { data: predictions, error } = await supabase
      .from('ai_prediction_logs')
      .select('*')
      .eq('user_id', userId)
      .is('evaluated_at', null)
      .lt('trading_date', new Date().toISOString().split('T')[0]);

    if (error) throw error;

    console.log(`Found ${predictions?.length || 0} unevaluated predictions`);

    // For each prediction, we'd need to fetch actual market data
    // This is a placeholder - in production you'd fetch from your market data source
    const evaluated: string[] = [];
    
    for (const prediction of predictions || []) {
      // Skip if trading date is today or future
      const tradingDate = new Date(prediction.trading_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (tradingDate >= today) continue;

      // Here you would fetch actual market data for the symbol on that trading date
      // For now, we'll mark these as needing manual evaluation
      console.log(`Prediction ${prediction.id} for ${prediction.symbol} on ${prediction.trading_date} needs evaluation`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Found ${predictions?.length || 0} predictions needing evaluation`,
      evaluated: evaluated.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error evaluating predictions:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function calculateAccuracy(
  prediction: PredictionLog,
  actual: { open: number; high: number; low: number; close: number }
): {
  directionCorrect: boolean;
  highAccuracy: number;
  lowAccuracy: number;
  overallScore: number;
} {
  // Direction accuracy
  const actualDirection = actual.close > actual.open ? 'bullish' : 
                          actual.close < actual.open ? 'bearish' : 'neutral';
  const directionCorrect = prediction.predicted_direction === actualDirection ||
    (prediction.predicted_direction === 'bullish' && actual.close > actual.open) ||
    (prediction.predicted_direction === 'bearish' && actual.close < actual.open);

  // High accuracy - how close was the predicted high to actual high?
  // 100% = perfect, decreases based on percentage error
  const highError = Math.abs(prediction.predicted_high - actual.high) / actual.high;
  const highAccuracy = Math.max(0, Math.min(100, (1 - highError) * 100));

  // Low accuracy
  const lowError = Math.abs(prediction.predicted_low - actual.low) / actual.low;
  const lowAccuracy = Math.max(0, Math.min(100, (1 - lowError) * 100));

  // Overall score: weighted combination
  // Direction: 40%, High: 30%, Low: 30%
  const overallScore = (directionCorrect ? 40 : 0) + (highAccuracy * 0.3) + (lowAccuracy * 0.3);

  return {
    directionCorrect,
    highAccuracy: Math.round(highAccuracy * 100) / 100,
    lowAccuracy: Math.round(lowAccuracy * 100) / 100,
    overallScore: Math.round(overallScore * 100) / 100,
  };
}
