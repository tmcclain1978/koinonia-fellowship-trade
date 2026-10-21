import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SupportResistanceLevel {
  price: number;
  strength: 'strong' | 'moderate' | 'weak';
  touches: number;
  type: 'support' | 'resistance';
  label: string;
}

interface BounceZone {
  high: number;
  low: number;
  type: 'bullish' | 'bearish';
  occurrences: number;
  avgBouncePercent: number;
}

interface PremarketAnalysis {
  gapPercent: number;
  gapDirection: 'up' | 'down' | 'flat';
  premarketHigh: number;
  premarketLow: number;
  premarketVWAP: number;
  volumeVsAvg: number;
  premarketRange: number;
}

interface DailyPrediction {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  predictedHigh: number;
  predictedLow: number;
  keyLevelToWatch: number;
  reasoning: string;
}

interface ChartAnalysis {
  symbol: string;
  timestamp: string;
  supportLevels: SupportResistanceLevel[];
  resistanceLevels: SupportResistanceLevel[];
  bounceZones: BounceZone[];
  premarketAnalysis: PremarketAnalysis | null;
  dailyPrediction: DailyPrediction;
}

// Find local pivots (highs and lows) in the candle data
function findPivots(candles: Candle[], lookback: number = 3): { highs: number[], lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
        isHigh = false;
      }
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
        isLow = false;
      }
    }
    
    if (isHigh) highs.push(candles[i].high);
    if (isLow) lows.push(candles[i].low);
  }
  
  return { highs, lows };
}

// Cluster nearby price levels
function clusterLevels(prices: number[], tolerance: number = 0.005): { price: number, count: number }[] {
  if (prices.length === 0) return [];
  
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: { prices: number[], count: number }[] = [];
  
  let currentCluster = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    const clusterAvg = currentCluster.reduce((a, b) => a + b, 0) / currentCluster.length;
    
    if (Math.abs(sorted[i] - clusterAvg) / clusterAvg < tolerance) {
      currentCluster.push(sorted[i]);
    } else {
      clusters.push({ 
        prices: [...currentCluster], 
        count: currentCluster.length 
      });
      currentCluster = [sorted[i]];
    }
  }
  
  clusters.push({ prices: currentCluster, count: currentCluster.length });
  
  return clusters
    .filter(c => c.count >= 2)
    .map(c => ({
      price: c.prices.reduce((a, b) => a + b, 0) / c.prices.length,
      count: c.count
    }))
    .sort((a, b) => b.count - a.count);
}

// Find support and resistance levels
function findSupportResistance(candles: Candle[]): { support: SupportResistanceLevel[], resistance: SupportResistanceLevel[] } {
  const { highs, lows } = findPivots(candles, 3);
  
  const resistanceClusters = clusterLevels(highs);
  const supportClusters = clusterLevels(lows);
  
  const currentPrice = candles[candles.length - 1]?.close || 0;
  
  const resistance: SupportResistanceLevel[] = resistanceClusters
    .filter(c => c.price > currentPrice * 0.99) // Above current price
    .slice(0, 5)
    .map((c, i) => ({
      price: Math.round(c.price * 100) / 100,
      strength: c.count >= 4 ? 'strong' : c.count >= 3 ? 'moderate' : 'weak',
      touches: c.count,
      type: 'resistance' as const,
      label: c.count >= 4 ? 'Major Resistance' : c.count >= 3 ? 'Key Resistance' : 'Minor Resistance'
    }));
  
  const support: SupportResistanceLevel[] = supportClusters
    .filter(c => c.price < currentPrice * 1.01) // Below current price
    .slice(0, 5)
    .map((c, i) => ({
      price: Math.round(c.price * 100) / 100,
      strength: c.count >= 4 ? 'strong' : c.count >= 3 ? 'moderate' : 'weak',
      touches: c.count,
      type: 'support' as const,
      label: c.count >= 4 ? 'Major Support' : c.count >= 3 ? 'Key Support' : 'Minor Support'
    }));
  
  return { support, resistance };
}

// Find bounce zones where price reversed
function findBounceZones(candles: Candle[]): BounceZone[] {
  const zones: BounceZone[] = [];
  const lookback = 5;
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    const prevCandles = candles.slice(i - lookback, i);
    const nextCandles = candles.slice(i + 1, i + lookback + 1);
    
    const prevTrend = prevCandles[prevCandles.length - 1].close - prevCandles[0].open;
    const nextTrend = nextCandles[nextCandles.length - 1].close - nextCandles[0].open;
    
    // Bullish reversal: was going down, now going up
    if (prevTrend < 0 && nextTrend > 0) {
      const zoneLow = Math.min(...prevCandles.map(c => c.low), candles[i].low);
      const zoneHigh = candles[i].high;
      const bouncePercent = (nextTrend / zoneLow) * 100;
      
      // Check if similar zone exists
      const existingZone = zones.find(z => 
        z.type === 'bullish' && 
        Math.abs(z.low - zoneLow) / zoneLow < 0.02
      );
      
      if (existingZone) {
        existingZone.occurrences++;
        existingZone.avgBouncePercent = (existingZone.avgBouncePercent + bouncePercent) / 2;
      } else {
        zones.push({
          high: Math.round(zoneHigh * 100) / 100,
          low: Math.round(zoneLow * 100) / 100,
          type: 'bullish',
          occurrences: 1,
          avgBouncePercent: Math.round(bouncePercent * 100) / 100
        });
      }
    }
    
    // Bearish reversal: was going up, now going down
    if (prevTrend > 0 && nextTrend < 0) {
      const zoneHigh = Math.max(...prevCandles.map(c => c.high), candles[i].high);
      const zoneLow = candles[i].low;
      const bouncePercent = Math.abs(nextTrend / zoneHigh) * 100;
      
      const existingZone = zones.find(z => 
        z.type === 'bearish' && 
        Math.abs(z.high - zoneHigh) / zoneHigh < 0.02
      );
      
      if (existingZone) {
        existingZone.occurrences++;
        existingZone.avgBouncePercent = (existingZone.avgBouncePercent + bouncePercent) / 2;
      } else {
        zones.push({
          high: Math.round(zoneHigh * 100) / 100,
          low: Math.round(zoneLow * 100) / 100,
          type: 'bearish',
          occurrences: 1,
          avgBouncePercent: Math.round(bouncePercent * 100) / 100
        });
      }
    }
  }
  
  return zones
    .filter(z => z.occurrences >= 2)
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 6);
}

// Analyze premarket data
function analyzePremarket(premarketCandles: Candle[], previousClose: number): PremarketAnalysis | null {
  if (!premarketCandles || premarketCandles.length === 0) return null;
  
  const premarketOpen = premarketCandles[0].open;
  const premarketHigh = Math.max(...premarketCandles.map(c => c.high));
  const premarketLow = Math.min(...premarketCandles.map(c => c.low));
  const premarketClose = premarketCandles[premarketCandles.length - 1].close;
  const totalVolume = premarketCandles.reduce((sum, c) => sum + c.volume, 0);
  
  // Calculate VWAP
  let vwapSum = 0;
  let volumeSum = 0;
  for (const candle of premarketCandles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    vwapSum += typicalPrice * candle.volume;
    volumeSum += candle.volume;
  }
  const vwap = volumeSum > 0 ? vwapSum / volumeSum : premarketClose;
  
  const gapPercent = ((premarketOpen - previousClose) / previousClose) * 100;
  const gapDirection = gapPercent > 0.2 ? 'up' : gapPercent < -0.2 ? 'down' : 'flat';
  
  return {
    gapPercent: Math.round(gapPercent * 100) / 100,
    gapDirection,
    premarketHigh: Math.round(premarketHigh * 100) / 100,
    premarketLow: Math.round(premarketLow * 100) / 100,
    premarketVWAP: Math.round(vwap * 100) / 100,
    volumeVsAvg: 1.0, // Would need historical data to calculate properly
    premarketRange: Math.round((premarketHigh - premarketLow) * 100) / 100
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, candles, premarketCandles, previousClose } = await req.json();
    
    if (!symbol || !candles || candles.length === 0) {
      return new Response(JSON.stringify({ error: 'Symbol and candles are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🧠 AI Chart Analysis for ${symbol} with ${candles.length} candles`);
    
    // Run technical analysis
    const { support, resistance } = findSupportResistance(candles);
    const bounceZones = findBounceZones(candles);
    const premarketAnalysis = premarketCandles && previousClose 
      ? analyzePremarket(premarketCandles, previousClose)
      : null;
    
    const currentPrice = candles[candles.length - 1]?.close || 0;
    const recentCandles = candles.slice(-20);
    const avgVolume = candles.slice(-50).reduce((sum: number, c: any) => sum + c.volume, 0) / 50;
    const recentVolume = recentCandles.reduce((sum: number, c: any) => sum + c.volume, 0) / recentCandles.length;
    const volumeStrength = recentVolume / avgVolume;
    
    // Prepare context for AI prediction
    const analysisContext = {
      symbol,
      currentPrice,
      supportLevels: support.slice(0, 3),
      resistanceLevels: resistance.slice(0, 3),
      bounceZones: bounceZones.slice(0, 3),
      premarketAnalysis,
      volumeStrength: Math.round(volumeStrength * 100) / 100,
      recentTrend: recentCandles[recentCandles.length - 1].close > recentCandles[0].open ? 'bullish' : 'bearish'
    };
    
    // Use Lovable AI for prediction enhancement
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let aiPrediction: DailyPrediction;
    
    if (LOVABLE_API_KEY) {
      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [
              {
                role: 'system',
                content: `You are a professional technical analyst. Analyze the given stock data and provide a prediction for the trading day. Be concise and actionable. Focus on the most important level to watch.`
              },
              {
                role: 'user',
                content: `Analyze ${symbol} at $${currentPrice}:

Support levels: ${support.slice(0, 3).map(s => `$${s.price} (${s.touches} touches)`).join(', ')}
Resistance levels: ${resistance.slice(0, 3).map(r => `$${r.price} (${r.touches} touches)`).join(', ')}
Bounce zones: ${bounceZones.slice(0, 2).map(b => `$${b.low}-$${b.high} (${b.type}, ${b.occurrences}x)`).join(', ')}
${premarketAnalysis ? `Premarket: Gap ${premarketAnalysis.gapDirection} ${premarketAnalysis.gapPercent}%, High $${premarketAnalysis.premarketHigh}, Low $${premarketAnalysis.premarketLow}` : ''}
Volume strength: ${volumeStrength > 1 ? 'Above' : 'Below'} average (${Math.round(volumeStrength * 100)}%)
Recent trend: ${analysisContext.recentTrend}

Provide: 1) Direction (bullish/bearish/neutral), 2) Confidence (0-100), 3) Predicted high, 4) Predicted low, 5) Key level to watch, 6) Brief reasoning (2-3 sentences).`
              }
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'provide_prediction',
                  description: 'Provide the daily trading prediction',
                  parameters: {
                    type: 'object',
                    properties: {
                      direction: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
                      confidence: { type: 'number', minimum: 0, maximum: 100 },
                      predictedHigh: { type: 'number' },
                      predictedLow: { type: 'number' },
                      keyLevelToWatch: { type: 'number' },
                      reasoning: { type: 'string' }
                    },
                    required: ['direction', 'confidence', 'predictedHigh', 'predictedLow', 'keyLevelToWatch', 'reasoning'],
                    additionalProperties: false
                  }
                }
              }
            ],
            tool_choice: { type: 'function', function: { name: 'provide_prediction' } }
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            aiPrediction = JSON.parse(toolCall.function.arguments);
            console.log('✅ AI prediction generated:', aiPrediction);
          } else {
            throw new Error('No tool call in AI response');
          }
        } else {
          throw new Error(`AI API error: ${aiResponse.status}`);
        }
      } catch (aiError) {
        console.error('AI prediction error, using fallback:', aiError);
        // Fallback to algorithmic prediction
        aiPrediction = generateFallbackPrediction(currentPrice, support, resistance, premarketAnalysis, volumeStrength);
      }
    } else {
      // No API key, use algorithmic prediction
      aiPrediction = generateFallbackPrediction(currentPrice, support, resistance, premarketAnalysis, volumeStrength);
    }
    
    const analysis: ChartAnalysis = {
      symbol,
      timestamp: new Date().toISOString(),
      supportLevels: support,
      resistanceLevels: resistance,
      bounceZones,
      premarketAnalysis,
      dailyPrediction: aiPrediction
    };

    console.log(`✅ Analysis complete for ${symbol}`);
    
    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Error in ai-chart-analysis:', error);
    return new Response(JSON.stringify({ error: (error as any).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Fallback prediction when AI is unavailable
function generateFallbackPrediction(
  currentPrice: number,
  support: SupportResistanceLevel[],
  resistance: SupportResistanceLevel[],
  premarketAnalysis: PremarketAnalysis | null,
  volumeStrength: number
): DailyPrediction {
  const nearestSupport = support[0]?.price || currentPrice * 0.98;
  const nearestResistance = resistance[0]?.price || currentPrice * 1.02;
  
  const distToSupport = (currentPrice - nearestSupport) / currentPrice;
  const distToResistance = (nearestResistance - currentPrice) / currentPrice;
  
  let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let confidence = 50;
  let reasoning = '';
  
  // Premarket gap influence
  if (premarketAnalysis) {
    if (premarketAnalysis.gapDirection === 'up' && premarketAnalysis.gapPercent > 0.5) {
      direction = 'bullish';
      confidence += 15;
      reasoning = `Strong premarket gap up of ${premarketAnalysis.gapPercent}%. `;
    } else if (premarketAnalysis.gapDirection === 'down' && premarketAnalysis.gapPercent < -0.5) {
      direction = 'bearish';
      confidence += 15;
      reasoning = `Significant premarket gap down of ${premarketAnalysis.gapPercent}%. `;
    }
  }
  
  // Support/resistance positioning
  if (distToSupport < 0.01) {
    if (direction !== 'bearish') direction = 'bullish';
    confidence += 10;
    reasoning += `Price at strong support near $${nearestSupport}. `;
  } else if (distToResistance < 0.01) {
    if (direction !== 'bullish') direction = 'bearish';
    confidence += 10;
    reasoning += `Price testing resistance at $${nearestResistance}. `;
  }
  
  // Volume influence
  if (volumeStrength > 1.2) {
    confidence += 10;
    reasoning += 'Above-average volume supports the move.';
  } else if (volumeStrength < 0.8) {
    confidence -= 10;
    reasoning += 'Low volume suggests weak conviction.';
  }
  
  confidence = Math.max(30, Math.min(85, confidence));
  
  const volatility = (nearestResistance - nearestSupport) / currentPrice;
  const predictedHigh = direction === 'bullish' 
    ? currentPrice * (1 + volatility * 0.6)
    : currentPrice * (1 + volatility * 0.3);
  const predictedLow = direction === 'bearish'
    ? currentPrice * (1 - volatility * 0.6)
    : currentPrice * (1 - volatility * 0.3);
  
  const keyLevel = direction === 'bullish' ? nearestResistance : nearestSupport;
  
  if (!reasoning) {
    reasoning = `Price is consolidating between support at $${nearestSupport.toFixed(2)} and resistance at $${nearestResistance.toFixed(2)}.`;
  }
  
  return {
    direction,
    confidence,
    predictedHigh: Math.round(predictedHigh * 100) / 100,
    predictedLow: Math.round(predictedLow * 100) / 100,
    keyLevelToWatch: Math.round(keyLevel * 100) / 100,
    reasoning: reasoning.trim()
  };
}
