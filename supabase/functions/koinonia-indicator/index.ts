import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, userId } = await req.json();

    if (!symbol || !userId) {
      return new Response(
        JSON.stringify({ error: "Symbol and userId are required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const POLYGON_API_KEY = Deno.env.get('POLYGON_API_KEY');
    const FMP_API_KEY = Deno.env.get('FMP_API_KEY');
    const authHeader = req.headers.get('authorization') || '';

    // Check user subscription tier
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    const { data: subData } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const userTier = roleData?.role || 'free_user';
    const isEnterprise = userTier === 'enterprise' || roleData?.role === 'admin';

    // Helper to fetch price data - prioritize Schwab candles (same as chart), fallback to Polygon
    const fetchPriceData = async (sym: string): Promise<any[]> => {
      // Try Schwab candles first (same data source as the chart)
      try {
        console.log(`[koinonia] Fetching Schwab candles for ${sym}`);
        const schwabResponse = await supabase.functions.invoke('fetch-schwab-candles', {
          body: { symbol: sym, interval: 'daily', period: '1m' }
        });
        
        if (schwabResponse.data?.candles && schwabResponse.data.candles.length > 0) {
          console.log(`[koinonia] Got ${schwabResponse.data.candles.length} candles from Schwab for ${sym}`);
          return schwabResponse.data.candles.map((c: any) => ({
            open: c.open,
            close: c.close,
            high: c.high,
            low: c.low,
            volume: c.volume,
            timestamp: c.timestamp || c.time
          }));
        }
        console.log(`[koinonia] Schwab returned no candles for ${sym}`);
      } catch (e) {
        console.log(`[koinonia] Schwab candles failed:`, e.message);
      }
      
      // Fallback to Polygon API
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`[koinonia] Trying Polygon for ${sym}, attempt ${attempt}`);
          const response = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/${sym}/range/1/day/${thirtyDaysAgo}/${today}?adjusted=true&apiKey=${POLYGON_API_KEY}`
          );
          
          if (response.status === 429) {
            console.log(`[koinonia] Polygon rate limited`);
            await new Promise(r => setTimeout(r, 500 * attempt));
            continue;
          }
          
          if (response.ok) {
            const data = await response.json();
            if (data.results && data.results.length > 0) {
              console.log(`[koinonia] Got ${data.results.length} candles from Polygon for ${sym}`);
              return data.results.map((r: any) => ({
                open: r.o,
                close: r.c,
                high: r.h,
                low: r.l,
                volume: r.v,
                timestamp: r.t
              }));
            }
          }
        } catch (e) {
          console.log(`[koinonia] Polygon fetch error:`, e.message);
        }
      }
      
      // Try Schwab quotes for at least current price
      try {
        console.log(`[koinonia] Trying Schwab quotes for current price of ${sym}`);
        const quoteResponse = await supabase.functions.invoke('schwab-quotes', {
          body: { symbols: [sym] }
        });
        
        if (quoteResponse.data?.quotes?.[sym]) {
          const q = quoteResponse.data.quotes[sym];
          const price = q.lastPrice || q.mark || q.regularMarketLastPrice;
          if (price && price > 0) {
            console.log(`[koinonia] Got current quote from Schwab: $${price}`);
            return [{
              open: price,
              close: price,
              high: q.highPrice || price * 1.01,
              low: q.lowPrice || price * 0.99,
              volume: q.totalVolume || 1000000,
              timestamp: Date.now()
            }];
          }
        }
      } catch (e) {
        console.log(`[koinonia] Schwab quotes failed:`, e.message);
      }
      
      return [];
    };

    // Fetch all data in parallel
    const [prices, sentimentData, learningInsights] = await Promise.all([
      fetchPriceData(symbol),
      
      // Fetch advanced news sentiment analysis
      supabase.functions.invoke('news-sentiment-scanner', { 
        body: { 
          symbol,
          queries: [
            `${symbol} stock`,
            `${symbol} stock price`,
            `${symbol} earnings`,
            `${symbol} analyst rating`,
            `${symbol} company news`
          ],
          numArticlesPerQuery: 5
        } 
      }),
      
      // Fetch user's bot learning insights
      supabase
        .from('bot_learning_insights')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)
    ]);

    // Handle case where no price data is available - inform user
    let finalPrices = prices;
    let usingFallbackData = false;
    
    if (prices.length === 0) {
      console.log('[koinonia] No price data available for symbol:', symbol, '- cannot provide accurate analysis');
      usingFallbackData = true;
      
      // Return error instead of using stale fallback data
      return new Response(
        JSON.stringify({
          error: 'Unable to fetch current price data',
          symbol,
          message: 'Market data is temporarily unavailable. Please try again in a moment.',
          usingFallbackData: true
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Calculate EMAs (9, 20, 50)
    const calculateEMA = (data: number[], period: number) => {
      if (!data || data.length === 0) return 0;
      const k = 2 / (period + 1);
      let ema = data[0] || 0;
      for (let i = 1; i < data.length; i++) {
        ema = (data[i] || 0) * k + ema * (1 - k);
      }
      return ema;
    };

    const closePrices = finalPrices.map((p: any) => p.close || 0).filter((p: number) => p > 0);
    const ema9 = closePrices.length >= 9 ? calculateEMA(closePrices.slice(-9), 9) : closePrices[closePrices.length - 1] || 0;
    const ema20 = closePrices.length >= 20 ? calculateEMA(closePrices.slice(-20), 20) : closePrices[closePrices.length - 1] || 0;
    const ema50 = closePrices.length >= 50 ? calculateEMA(closePrices.slice(-50), 50) : closePrices[closePrices.length - 1] || 0;

    // Calculate VWAP
    const calculateVWAP = (data: any[]) => {
      let cumVolPrice = 0;
      let cumVol = 0;
      for (const d of data) {
        const typical = (d.high + d.low + d.close) / 3;
        cumVolPrice += typical * d.volume;
        cumVol += d.volume;
      }
      return cumVol > 0 ? cumVolPrice / cumVol : 0;
    };

    const vwap = calculateVWAP(finalPrices.slice(-20));
    const currentPrice = finalPrices[finalPrices.length - 1]?.close || 0;

    // Calculate RSI
    const calculateRSI = (data: number[], period: number = 14) => {
      if (!data || data.length < 2) return 50; // Neutral RSI if not enough data
      let gains = 0;
      let losses = 0;
      for (let i = 1; i < period && i < data.length; i++) {
        const change = data[i] - data[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
      }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      return 100 - (100 / (1 + rs));
    };

    const rsi = calculateRSI(closePrices.slice(-20));

    // Calculate Bollinger Bands
    const calculateBollingerBands = (data: number[], period: number = 20) => {
      if (!data || data.length === 0) {
        return { upper: 0, middle: 0, lower: 0 };
      }
      const slicedData = data.slice(-period);
      const sma = slicedData.reduce((a, b) => a + b, 0) / slicedData.length;
      const variance = slicedData.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / slicedData.length;
      const stdDev = Math.sqrt(variance);
      return {
        upper: sma + (2 * stdDev),
        middle: sma,
        lower: sma - (2 * stdDev)
      };
    };

    const bollingerBands = calculateBollingerBands(closePrices);

    // Candlestick Pattern Recognition
    const detectCandlestickPatterns = (data: any[]) => {
      if (data.length < 5) return [];
      const patterns: { name: string; type: string; reliability: string; signal: string }[] = [];
      
      // Get last few candles for pattern detection
      const candles = data.slice(-5).map(d => ({
        open: d.open || d.close,
        close: d.close,
        high: d.high,
        low: d.low,
        body: Math.abs((d.open || d.close) - d.close),
        upperWick: d.high - Math.max(d.open || d.close, d.close),
        lowerWick: Math.min(d.open || d.close, d.close) - d.low,
        isBullish: d.close > (d.open || d.close)
      }));
      
      const c = candles[candles.length - 1];
      const prev = candles[candles.length - 2];
      const prev2 = candles[candles.length - 3];
      
      // Calculate average body size for comparison
      const avgBody = candles.reduce((sum, cd) => sum + cd.body, 0) / candles.length;
      
      // 1. Hammer (bullish reversal) - small body at top, long lower wick (2x body), minimal upper wick
      if (c.body < avgBody * 0.5 && c.lowerWick > c.body * 2 && c.upperWick < c.body * 0.3) {
        patterns.push({ name: 'Hammer', type: 'Bullish Reversal', reliability: 'High (9/10)', signal: 'BUY' });
      }
      
      // 2. Inverted Hammer (bullish reversal) - small body at bottom, long upper wick
      if (c.body < avgBody * 0.5 && c.upperWick > c.body * 2 && c.lowerWick < c.body * 0.3 && !c.isBullish) {
        patterns.push({ name: 'Inverted Hammer', type: 'Bullish Reversal', reliability: 'Medium (8/10)', signal: 'BUY' });
      }
      
      // 3. Shooting Star (bearish reversal) - small body at bottom, long upper wick, after uptrend
      if (c.body < avgBody * 0.5 && c.upperWick > c.body * 2 && c.lowerWick < c.body * 0.3 && prev.isBullish) {
        patterns.push({ name: 'Shooting Star', type: 'Bearish Reversal', reliability: 'High (9/10)', signal: 'SELL' });
      }
      
      // 4. Hanging Man (bearish reversal) - hammer shape but after uptrend
      if (c.body < avgBody * 0.5 && c.lowerWick > c.body * 2 && c.upperWick < c.body * 0.3 && prev.isBullish) {
        patterns.push({ name: 'Hanging Man', type: 'Bearish Reversal', reliability: 'High (9/10)', signal: 'SELL' });
      }
      
      // 5. Bullish Engulfing - current bullish candle engulfs previous bearish
      if (c.isBullish && !prev.isBullish && c.body > prev.body * 1.5) {
        patterns.push({ name: 'Bullish Engulfing', type: 'Bullish Reversal', reliability: 'High (9/10)', signal: 'BUY' });
      }
      
      // 6. Bearish Engulfing - current bearish candle engulfs previous bullish
      if (!c.isBullish && prev.isBullish && c.body > prev.body * 1.5) {
        patterns.push({ name: 'Bearish Engulfing', type: 'Bearish Reversal', reliability: 'High (9/10)', signal: 'SELL' });
      }
      
      // 7. Doji - open and close nearly equal (indecision)
      if (c.body < avgBody * 0.1) {
        // Dragonfly Doji (bullish) - long lower wick
        if (c.lowerWick > avgBody && c.upperWick < c.body * 0.5) {
          patterns.push({ name: 'Dragonfly Doji', type: 'Bullish Reversal', reliability: 'Medium (7/10)', signal: 'BUY' });
        }
        // Gravestone Doji (bearish) - long upper wick
        else if (c.upperWick > avgBody && c.lowerWick < c.body * 0.5) {
          patterns.push({ name: 'Gravestone Doji', type: 'Bearish Reversal', reliability: 'Medium (7/10)', signal: 'SELL' });
        }
        // Standard Doji
        else {
          patterns.push({ name: 'Doji', type: 'Indecision', reliability: 'Medium (6/10)', signal: 'NEUTRAL' });
        }
      }
      
      // 8. Morning Star (bullish reversal) - 3 candle pattern
      if (candles.length >= 3 && !prev2.isBullish && prev.body < avgBody * 0.3 && c.isBullish && c.body > avgBody) {
        patterns.push({ name: 'Morning Star', type: 'Bullish Reversal', reliability: 'High (9/10)', signal: 'BUY' });
      }
      
      // 9. Evening Star (bearish reversal) - 3 candle pattern
      if (candles.length >= 3 && prev2.isBullish && prev.body < avgBody * 0.3 && !c.isBullish && c.body > avgBody) {
        patterns.push({ name: 'Evening Star', type: 'Bearish Reversal', reliability: 'High (9/10)', signal: 'SELL' });
      }
      
      // 10. Three White Soldiers (bullish continuation) - 3 consecutive bullish candles
      if (candles.length >= 3 && c.isBullish && prev.isBullish && prev2.isBullish && 
          c.close > prev.close && prev.close > prev2.close) {
        patterns.push({ name: 'Three White Soldiers', type: 'Bullish Continuation', reliability: 'High (9/10)', signal: 'BUY' });
      }
      
      // 11. Three Black Crows (bearish continuation) - 3 consecutive bearish candles
      if (candles.length >= 3 && !c.isBullish && !prev.isBullish && !prev2.isBullish && 
          c.close < prev.close && prev.close < prev2.close) {
        patterns.push({ name: 'Three Black Crows', type: 'Bearish Continuation', reliability: 'High (9/10)', signal: 'SELL' });
      }
      
      // 12. Bullish Marubozu - full bullish body, no wicks
      if (c.isBullish && c.body > avgBody * 1.5 && c.upperWick < c.body * 0.05 && c.lowerWick < c.body * 0.05) {
        patterns.push({ name: 'Bullish Marubozu', type: 'Bullish Continuation', reliability: 'High (9/10)', signal: 'BUY' });
      }
      
      // 13. Bearish Marubozu - full bearish body, no wicks
      if (!c.isBullish && c.body > avgBody * 1.5 && c.upperWick < c.body * 0.05 && c.lowerWick < c.body * 0.05) {
        patterns.push({ name: 'Bearish Marubozu', type: 'Bearish Continuation', reliability: 'High (9/10)', signal: 'SELL' });
      }
      
      // 14. Piercing Line (bullish) - bearish then bullish closes above midpoint
      if (c.isBullish && !prev.isBullish && c.close > (prev.open + prev.close) / 2) {
        patterns.push({ name: 'Piercing Line', type: 'Bullish Reversal', reliability: 'Medium (7/10)', signal: 'BUY' });
      }
      
      // 15. Dark Cloud Cover (bearish) - bullish then bearish closes below midpoint
      if (!c.isBullish && prev.isBullish && c.close < (prev.open + prev.close) / 2) {
        patterns.push({ name: 'Dark Cloud Cover', type: 'Bearish Reversal', reliability: 'High (9/10)', signal: 'SELL' });
      }
      
      // 16. Tweezer Bottom (bullish) - same lows
      if (Math.abs(c.low - prev.low) < avgBody * 0.1 && c.isBullish && !prev.isBullish) {
        patterns.push({ name: 'Tweezer Bottom', type: 'Bullish Reversal', reliability: 'Medium (7/10)', signal: 'BUY' });
      }
      
      // 17. Tweezer Top (bearish) - same highs
      if (Math.abs(c.high - prev.high) < avgBody * 0.1 && !c.isBullish && prev.isBullish) {
        patterns.push({ name: 'Tweezer Top', type: 'Bearish Reversal', reliability: 'Medium (7/10)', signal: 'SELL' });
      }
      
      // 18. Bullish Harami - small bullish inside large bearish
      if (c.isBullish && !prev.isBullish && c.body < prev.body * 0.5 && 
          c.high < prev.open && c.low > prev.close) {
        patterns.push({ name: 'Bullish Harami', type: 'Bullish Reversal', reliability: 'Medium (7/10)', signal: 'BUY' });
      }
      
      // 19. Bearish Harami - small bearish inside large bullish
      if (!c.isBullish && prev.isBullish && c.body < prev.body * 0.5 && 
          c.high < prev.close && c.low > prev.open) {
        patterns.push({ name: 'Bearish Harami', type: 'Bearish Reversal', reliability: 'Medium (7/10)', signal: 'SELL' });
      }
      
      return patterns;
    };
    
    const detectedPatterns = detectCandlestickPatterns(finalPrices);
    const patternSummary = detectedPatterns.length > 0 
      ? detectedPatterns.map(p => `${p.name} (${p.type}, ${p.reliability}) → ${p.signal}`).join('\n  • ')
      : 'No significant patterns detected';

    // Prepare AI analysis prompt with enhanced sentiment data
    const sentimentInfo = sentimentData.data || {};
    const aggregate = sentimentInfo.aggregate || { overallLabel: 'Neutral', overallScore: 0, weightedScore: 0 };
    const breakdown = sentimentInfo.sentimentBreakdown || { bullishPercent: 33, bearishPercent: 33, neutralPercent: 34 };
    
    const systemPrompt = `You are the Koinonia Indicator, a proprietary AI-powered trading system that provides highly accurate entry and exit signals for options trading. 

Your analysis methodology includes:
- Technical Analysis: EMAs (9, 20, 50), VWAP, RSI, Bollinger Bands, Volume patterns, Support/Resistance levels
- CANDLESTICK PATTERN RECOGNITION: You identify and analyze 41+ candlestick patterns including Hammer, Engulfing, Doji, Morning Star, Evening Star, Three White Soldiers, Marubozu, and more
- Advanced News Sentiment: Real-time multi-source sentiment analysis with confidence scoring
- Machine Learning: Historical performance data and pattern recognition
- Options Greeks: Delta, Gamma, Theta, Vega analysis
- IV Rank/Percentile: Implied volatility analysis
- Market Microstructure: Order flow and liquidity analysis

When analyzing candlestick patterns, consider:
- Reliability scores (1-10 scale)
- Pattern confirmation requirements
- Timeframe suitability
- Volume confirmation
- Context (uptrend/downtrend/consolidation)

Provide entry and exit signals with high confidence levels (aim for 85-95% accuracy). Be precise about entry prices, stop losses, and profit targets.`;

    const topBullishHeadlines = sentimentInfo.topBullish?.map((h: any) => `  • ${h.title} (${((h.score || 0) * 100).toFixed(0)}% bullish)`).join('\n') || 'None';
    const topBearishHeadlines = sentimentInfo.topBearish?.map((h: any) => `  • ${h.title} (${(Math.abs(h.score || 0) * 100).toFixed(0)}% bearish)`).join('\n') || 'None';
    
    // Safe number formatting helper
    const safeFixed = (num: number | undefined | null, decimals: number = 2): string => {
      if (num === undefined || num === null || isNaN(num)) return '0.00';
      return num.toFixed(decimals);
    };
    
    const priceMin = closePrices.length > 0 ? Math.min(...closePrices.slice(-20)) : 0;
    const priceMax = closePrices.length > 0 ? Math.max(...closePrices.slice(-20)) : 0;

    const userPrompt = `Analyze ${symbol} for options trading signals.

TECHNICAL DATA:
- Current Price: $${safeFixed(currentPrice)}
- EMA9: $${safeFixed(ema9)}
- EMA20: $${safeFixed(ema20)}
- EMA50: $${safeFixed(ema50)}
- VWAP: $${safeFixed(vwap)}
- RSI: ${safeFixed(rsi)}
- Bollinger Bands: Upper ${safeFixed(bollingerBands.upper)}, Middle ${safeFixed(bollingerBands.middle)}, Lower ${safeFixed(bollingerBands.lower)}
- 20-Day Price Range: $${safeFixed(priceMin)} - $${safeFixed(priceMax)}

🕯️ CANDLESTICK PATTERN ANALYSIS:
Detected Patterns:
  • ${patternSummary}

📰 ADVANCED NEWS SENTIMENT ANALYSIS:
- Overall Sentiment: ${aggregate.overallLabel || 'Unknown'} (Score: ${safeFixed((aggregate.overallScore || 0) * 100, 1)}%)
- Weighted Confidence Score: ${safeFixed((aggregate.weightedScore || 0) * 100, 1)}%
- Articles Analyzed: ${sentimentInfo.totalArticlesAnalyzed || 0}
- Sentiment Breakdown:
  • Bullish: ${safeFixed(breakdown.bullishPercent, 1)}%
  • Bearish: ${safeFixed(breakdown.bearishPercent, 1)}%
  • Neutral: ${safeFixed(breakdown.neutralPercent, 1)}%

Top Bullish Headlines:
${topBullishHeadlines}

Top Bearish Headlines:
${topBearishHeadlines}

LEARNING INSIGHTS:
${learningInsights.data?.map((i: any) => 
  `- Date: ${i.insight_date}, Avg Profit Factor: ${i.avg_profit_factor}, IV Accuracy: ${i.iv_regime_accuracy}%`
).join('\n') || 'No historical insights'}

Provide:
1. Entry Signal (price and confidence %)
2. Exit Signal (price and confidence %)
3. Stop Loss level
4. Take Profit levels (2-3 targets)
5. Risk/Reward ratio
6. Key reasoning for the trade (incorporate candlestick patterns and sentiment analysis)
7. Optimal option strategy (CALL/PUT and expiration)
8. Candlestick pattern interpretation
9. News sentiment impact assessment

Format your response as JSON with this structure:
{
  "entrySignal": { "price": number, "confidence": number, "reasoning": string },
  "exitSignals": [{ "price": number, "type": "stop_loss" | "take_profit", "confidence": number }],
  "optionStrategy": { "type": "CALL" | "PUT", "strike": number, "expiration": "YYYY-MM-DD" },
  "riskReward": number,
  "overallConfidence": number,
  "analysis": string,
  "candlestickAnalysis": { "patterns": string[], "interpretation": string, "signalStrength": number },
  "sentimentImpact": { "direction": "bullish" | "bearish" | "neutral", "strength": number, "keyFactors": string[] }
}`;

    // Call AI for analysis
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysisText = aiData.choices[0].message.content;
    const analysis = JSON.parse(analysisText);

    // Return the signals with sentiment data and candlestick patterns
    return new Response(
      JSON.stringify({
        symbol,
        timestamp: new Date().toISOString(),
        signals: analysis,
        technicals: {
          currentPrice,
          ema9,
          ema20,
          ema50,
          vwap,
          rsi,
          bollingerBands
        },
        candlestickPatterns: detectedPatterns,
        sentiment: {
          overall: aggregate.overallLabel,
          score: aggregate.overallScore,
          weightedScore: aggregate.weightedScore,
          articlesAnalyzed: sentimentInfo.totalArticlesAnalyzed || 0,
          breakdown: breakdown,
          topBullish: sentimentInfo.topBullish || [],
          topBearish: sentimentInfo.topBearish || []
        },
        isEnterprise,
        requiresPayment: !isEnterprise,
        usingFallbackData,
        note: usingFallbackData ? 'Using estimated data - market may be closed or API temporarily unavailable' : undefined
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in koinonia-indicator:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
