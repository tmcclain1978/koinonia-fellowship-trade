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
    const FMP_API_KEY = Deno.env.get('FMP_API_KEY');
    const POLYGON_API_KEY = Deno.env.get('POLYGON_API_KEY');
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

    // Fetch unevaluated predictions for the user
    const { data: predictions, error } = await supabase
      .from('ai_prediction_logs')
      .select('*')
      .eq('user_id', userId)
      .is('evaluated_at', null)
      .lt('trading_date', new Date().toISOString().split('T')[0]);

    if (error) throw error;

    console.log(`Found ${predictions?.length || 0} unevaluated predictions`);

    const evaluated: string[] = [];
    const errors: string[] = [];
    
    for (const prediction of predictions || []) {
      // Skip if trading date is today or future
      const tradingDate = new Date(prediction.trading_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (tradingDate >= today) continue;

      // Fetch actual market data for the symbol on that trading date
      const actualMarketData = await fetchHistoricalData(
        prediction.symbol, 
        prediction.trading_date,
        FMP_API_KEY,
        POLYGON_API_KEY
      );

      if (actualMarketData) {
        const evaluation = calculateAccuracy(prediction, actualMarketData);
        
        const { error: updateError } = await supabase
          .from('ai_prediction_logs')
          .update({
            actual_open: actualMarketData.open,
            actual_high: actualMarketData.high,
            actual_low: actualMarketData.low,
            actual_close: actualMarketData.close,
            direction_correct: evaluation.directionCorrect,
            high_accuracy_pct: evaluation.highAccuracy,
            low_accuracy_pct: evaluation.lowAccuracy,
            overall_score: evaluation.overallScore,
            evaluated_at: new Date().toISOString(),
          })
          .eq('id', prediction.id);

        if (updateError) {
          console.error(`Error updating prediction ${prediction.id}:`, updateError);
          errors.push(prediction.id);
        } else {
          evaluated.push(prediction.id);
          console.log(`Evaluated prediction ${prediction.id} for ${prediction.symbol}: score=${evaluation.overallScore}%`);
        }
      } else {
        console.log(`Could not fetch market data for ${prediction.symbol} on ${prediction.trading_date}`);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Found ${predictions?.length || 0} predictions needing evaluation`,
      evaluated: evaluated.length,
      evaluatedIds: evaluated,
      errors: errors.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error evaluating predictions:', error);
    return new Response(JSON.stringify({ error: (error as any).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchHistoricalData(
  symbol: string, 
  date: string,
  fmpApiKey?: string,
  polygonApiKey?: string
): Promise<{ open: number; high: number; low: number; close: number } | null> {
  
  // Try FMP first
  if (fmpApiKey) {
    try {
      const resp = await fetch(
        `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?from=${date}&to=${date}&apikey=${fmpApiKey}`
      );
      
      if (resp.ok) {
        const data = await resp.json();
        const candle = data?.historical?.[0];
        
        if (candle) {
          return {
            open: Number(candle.open),
            high: Number(candle.high),
            low: Number(candle.low),
            close: Number(candle.close),
          };
        }
      }
    } catch (e) {
      console.error('FMP historical fetch error:', e);
    }
  }

  // Try Polygon
  if (polygonApiKey) {
    try {
      const resp = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${date}/${date}?adjusted=true&apiKey=${polygonApiKey}`
      );
      
      if (resp.ok) {
        const data = await resp.json();
        const candle = data?.results?.[0];
        
        if (candle) {
          return {
            open: Number(candle.o),
            high: Number(candle.h),
            low: Number(candle.l),
            close: Number(candle.c),
          };
        }
      }
    } catch (e) {
      console.error('Polygon historical fetch error:', e);
    }
  }

  return null;
}

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
