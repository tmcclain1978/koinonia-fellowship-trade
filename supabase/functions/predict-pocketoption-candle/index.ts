import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Candle {
  direction: string;
  timestamp: string;
}

interface PredictionResult {
  direction: 'up' | 'down';
  confidence: number;
  method: string;
  details: string;
}

// Algorithm 1: Sequence Matching - Find historical patterns matching current sequence
function sequenceMatch(
  currentSequence: string[],
  historicalCandles: Candle[]
): PredictionResult | null {
  if (currentSequence.length < 3 || historicalCandles.length < currentSequence.length + 1) {
    return null;
  }

  const sequenceStr = currentSequence.join(',');
  let upCount = 0;
  let downCount = 0;

  // Slide through historical data looking for matches
  for (let i = 0; i <= historicalCandles.length - currentSequence.length - 1; i++) {
    const historicalSeq = historicalCandles
      .slice(i, i + currentSequence.length)
      .map(c => c.direction)
      .join(',');

    if (historicalSeq === sequenceStr) {
      // Found a match - what happened next?
      const nextCandle = historicalCandles[i + currentSequence.length];
      if (nextCandle.direction === 'up') {
        upCount++;
      } else if (nextCandle.direction === 'down') {
        downCount++;
      }
    }
  }

  const totalMatches = upCount + downCount;
  if (totalMatches < 2) {
    return null;
  }

  const upProbability = upCount / totalMatches;
  const direction = upProbability > 0.5 ? 'up' : 'down';
  const confidence = Math.round(Math.max(upProbability, 1 - upProbability) * 100);

  return {
    direction,
    confidence,
    method: 'sequence',
    details: `${totalMatches} historical matches (${upCount} up, ${downCount} down)`,
  };
}

// Algorithm 2: Cycle Detection using autocorrelation
function cycleDetection(candles: Candle[]): PredictionResult | null {
  if (candles.length < 20) {
    return null;
  }

  const directions = candles.map(c => c.direction === 'up' ? 1 : -1);
  
  // Calculate autocorrelation for different lag values
  let bestLag = 0;
  let bestCorrelation = 0;

  for (let lag = 5; lag <= Math.min(20, Math.floor(candles.length / 2)); lag++) {
    let correlation = 0;
    let count = 0;

    for (let i = 0; i < directions.length - lag; i++) {
      correlation += directions[i] * directions[i + lag];
      count++;
    }

    correlation = correlation / count;

    if (Math.abs(correlation) > Math.abs(bestCorrelation)) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag === 0 || Math.abs(bestCorrelation) < 0.3) {
    return null;
  }

  // Use detected cycle to predict next candle
  const currentPosition = (candles.length - 1) % bestLag;
  
  // Count what typically happens at this cycle position
  let upAtPosition = 0;
  let downAtPosition = 0;

  for (let i = currentPosition; i < candles.length; i += bestLag) {
    if (i + 1 < candles.length) {
      if (candles[i + 1].direction === 'up') {
        upAtPosition++;
      } else {
        downAtPosition++;
      }
    }
  }

  const total = upAtPosition + downAtPosition;
  if (total < 2) {
    return null;
  }

  const upProbability = upAtPosition / total;
  const direction = upProbability > 0.5 ? 'up' : 'down';
  const confidence = Math.round(Math.max(upProbability, 1 - upProbability) * 100);

  return {
    direction,
    confidence,
    method: 'cycle',
    details: `Cycle length ${bestLag}, position ${currentPosition + 1}/${bestLag} (correlation: ${(bestCorrelation * 100).toFixed(0)}%)`,
  };
}

// Algorithm 3: Markov Chain - State transition probabilities
function markovChain(candles: Candle[], stateLength: number = 3): PredictionResult | null {
  if (candles.length < stateLength + 2) {
    return null;
  }

  // Build transition matrix
  const transitions: Record<string, { up: number; down: number }> = {};

  for (let i = 0; i <= candles.length - stateLength - 1; i++) {
    const state = candles
      .slice(i, i + stateLength)
      .map(c => c.direction)
      .join('-');
    const nextDirection = candles[i + stateLength].direction;

    if (!transitions[state]) {
      transitions[state] = { up: 0, down: 0 };
    }

    if (nextDirection === 'up') {
      transitions[state].up++;
    } else if (nextDirection === 'down') {
      transitions[state].down++;
    }
  }

  // Get current state
  const currentState = candles
    .slice(-stateLength)
    .map(c => c.direction)
    .join('-');

  const stateTransitions = transitions[currentState];
  if (!stateTransitions) {
    return null;
  }

  const total = stateTransitions.up + stateTransitions.down;
  if (total < 2) {
    return null;
  }

  const upProbability = stateTransitions.up / total;
  const direction = upProbability > 0.5 ? 'up' : 'down';
  const confidence = Math.round(Math.max(upProbability, 1 - upProbability) * 100);

  return {
    direction,
    confidence,
    method: 'markov',
    details: `State "${currentState}" → ${stateTransitions.up} up, ${stateTransitions.down} down`,
  };
}

// Ensemble voting - combine all algorithm predictions
function ensembleVote(predictions: PredictionResult[]): {
  direction: 'up' | 'down';
  confidence: number;
  agreement: string;
  details: PredictionResult[];
} {
  if (predictions.length === 0) {
    return {
      direction: 'up',
      confidence: 50,
      agreement: '0/0',
      details: [],
    };
  }

  // Weight by confidence
  let upScore = 0;
  let downScore = 0;

  for (const pred of predictions) {
    const weight = pred.confidence / 100;
    if (pred.direction === 'up') {
      upScore += weight;
    } else {
      downScore += weight;
    }
  }

  const totalScore = upScore + downScore;
  const direction = upScore > downScore ? 'up' : 'down';
  
  // Calculate final confidence
  const dominantScore = Math.max(upScore, downScore);
  const confidence = Math.round((dominantScore / totalScore) * 100);

  // Count agreement
  const agreeCount = predictions.filter(p => p.direction === direction).length;
  const agreement = `${agreeCount}/${predictions.length}`;

  return {
    direction,
    confidence,
    agreement,
    details: predictions,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { pair, sequenceLength = 5 } = await req.json();

    if (!pair) {
      throw new Error("Pair is required");
    }

    // Fetch recent candle history for this pair
    const { data: candles, error: candlesError } = await supabaseClient
      .from('pocketoption_candles')
      .select('direction, timestamp')
      .eq('user_id', user.id)
      .eq('pair', pair)
      .order('timestamp', { ascending: true })
      .limit(500);

    if (candlesError) {
      console.error("Error fetching candles:", candlesError);
      throw new Error("Failed to fetch candle history");
    }

    if (!candles || candles.length < 10) {
      return new Response(
        JSON.stringify({
          success: true,
          prediction: null,
          message: `Insufficient data: ${candles?.length || 0} candles. Need at least 10 candles for prediction.`,
          candles_count: candles?.length || 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current sequence (last N candles)
    const currentSequence = candles
      .slice(-sequenceLength)
      .map(c => c.direction);

    // Run all prediction algorithms
    const predictions: PredictionResult[] = [];

    // Algorithm 1: Sequence matching
    const seqResult = sequenceMatch(currentSequence, candles as Candle[]);
    if (seqResult) {
      predictions.push(seqResult);
    }

    // Algorithm 2: Cycle detection
    const cycleResult = cycleDetection(candles as Candle[]);
    if (cycleResult) {
      predictions.push(cycleResult);
    }

    // Algorithm 3: Markov chain (try multiple state lengths)
    for (const stateLen of [2, 3, 4]) {
      const markovResult = markovChain(candles as Candle[], stateLen);
      if (markovResult) {
        markovResult.method = `markov_${stateLen}`;
        predictions.push(markovResult);
        break; // Use first successful
      }
    }

    // Ensemble vote
    const finalPrediction = ensembleVote(predictions);

    // Store the prediction for accuracy tracking
    const { error: insertError } = await supabaseClient
      .from('pocketoption_predictions')
      .insert({
        user_id: user.id,
        pair,
        predicted_direction: finalPrediction.direction,
        confidence: finalPrediction.confidence,
        prediction_method: predictions.map(p => p.method).join(','),
        sequence_used: currentSequence.join(','),
      });

    if (insertError) {
      console.error("Error storing prediction:", insertError);
    }

    console.log(`Prediction for ${pair}: ${finalPrediction.direction} (${finalPrediction.confidence}% confidence, ${finalPrediction.agreement} agreement)`);

    return new Response(
      JSON.stringify({
        success: true,
        prediction: {
          direction: finalPrediction.direction,
          confidence: finalPrediction.confidence,
          agreement: finalPrediction.agreement,
          algorithms: finalPrediction.details,
          sequence: currentSequence,
        },
        candles_count: candles.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error("Prediction error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: (error as any).message || "Prediction failed",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
