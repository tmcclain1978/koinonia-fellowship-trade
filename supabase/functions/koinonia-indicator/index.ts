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

    // Fetch market data from Polygon
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [priceData, sentimentData, learningInsights] = await Promise.all([
      // Fetch historical price data for technical analysis
      fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${thirtyDaysAgo}/${today}?apiKey=${POLYGON_API_KEY}`)
        .then(res => res.json()),
      
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

    // Calculate technical indicators
    const prices = priceData.results?.map((r: any) => ({
      close: r.c,
      high: r.h,
      low: r.l,
      volume: r.v,
      timestamp: r.t
    })) || [];

    // Calculate EMAs (9, 20, 50)
    const calculateEMA = (data: number[], period: number) => {
      const k = 2 / (period + 1);
      let ema = data[0];
      for (let i = 1; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
      }
      return ema;
    };

    const closePrices = prices.map((p: any) => p.close);
    const ema9 = calculateEMA(closePrices.slice(-9), 9);
    const ema20 = calculateEMA(closePrices.slice(-20), 20);
    const ema50 = calculateEMA(closePrices.slice(-50), 50);

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

    const vwap = calculateVWAP(prices.slice(-20));
    const currentPrice = prices[prices.length - 1]?.close || 0;

    // Calculate RSI
    const calculateRSI = (data: number[], period: number = 14) => {
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
      const sma = data.slice(-period).reduce((a, b) => a + b, 0) / period;
      const variance = data.slice(-period).reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      return {
        upper: sma + (2 * stdDev),
        middle: sma,
        lower: sma - (2 * stdDev)
      };
    };

    const bollingerBands = calculateBollingerBands(closePrices);

    // Prepare AI analysis prompt with enhanced sentiment data
    const sentimentInfo = sentimentData.data || {};
    const aggregate = sentimentInfo.aggregate || { overallLabel: 'Neutral', overallScore: 0, weightedScore: 0 };
    const breakdown = sentimentInfo.sentimentBreakdown || { bullishPercent: 33, bearishPercent: 33, neutralPercent: 34 };
    
    const systemPrompt = `You are the Koinonia Indicator, a proprietary AI-powered trading system that provides highly accurate entry and exit signals for options trading. 

Your analysis methodology includes:
- Technical Analysis: EMAs (9, 20, 50), VWAP, RSI, Bollinger Bands, Volume patterns, Support/Resistance levels
- Advanced News Sentiment: Real-time multi-source sentiment analysis with confidence scoring
- Machine Learning: Historical performance data and pattern recognition
- Options Greeks: Delta, Gamma, Theta, Vega analysis
- IV Rank/Percentile: Implied volatility analysis
- Market Microstructure: Order flow and liquidity analysis

Provide entry and exit signals with high confidence levels (aim for 85-95% accuracy). Be precise about entry prices, stop losses, and profit targets.`;

    const topBullishHeadlines = sentimentInfo.topBullish?.map((h: any) => `  • ${h.title} (${(h.score * 100).toFixed(0)}% bullish)`).join('\n') || 'None';
    const topBearishHeadlines = sentimentInfo.topBearish?.map((h: any) => `  • ${h.title} (${(Math.abs(h.score) * 100).toFixed(0)}% bearish)`).join('\n') || 'None';

    const userPrompt = `Analyze ${symbol} for options trading signals.

TECHNICAL DATA:
- Current Price: $${currentPrice.toFixed(2)}
- EMA9: $${ema9.toFixed(2)}
- EMA20: $${ema20.toFixed(2)}
- EMA50: $${ema50.toFixed(2)}
- VWAP: $${vwap.toFixed(2)}
- RSI: ${rsi.toFixed(2)}
- Bollinger Bands: Upper ${bollingerBands.upper.toFixed(2)}, Middle ${bollingerBands.middle.toFixed(2)}, Lower ${bollingerBands.lower.toFixed(2)}
- 20-Day Price Range: $${Math.min(...closePrices.slice(-20)).toFixed(2)} - $${Math.max(...closePrices.slice(-20)).toFixed(2)}

📰 ADVANCED NEWS SENTIMENT ANALYSIS:
- Overall Sentiment: ${aggregate.overallLabel} (Score: ${(aggregate.overallScore * 100).toFixed(1)}%)
- Weighted Confidence Score: ${(aggregate.weightedScore * 100).toFixed(1)}%
- Articles Analyzed: ${sentimentInfo.totalArticlesAnalyzed || 0}
- Sentiment Breakdown:
  • Bullish: ${breakdown.bullishPercent?.toFixed(1)}%
  • Bearish: ${breakdown.bearishPercent?.toFixed(1)}%
  • Neutral: ${breakdown.neutralPercent?.toFixed(1)}%

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
6. Key reasoning for the trade (incorporate sentiment analysis)
7. Optimal option strategy (CALL/PUT and expiration)
8. News sentiment impact assessment

Format your response as JSON with this structure:
{
  "entrySignal": { "price": number, "confidence": number, "reasoning": string },
  "exitSignals": [{ "price": number, "type": "stop_loss" | "take_profit", "confidence": number }],
  "optionStrategy": { "type": "CALL" | "PUT", "strike": number, "expiration": "YYYY-MM-DD" },
  "riskReward": number,
  "overallConfidence": number,
  "analysis": string,
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

    // Return the signals with sentiment data
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
        requiresPayment: !isEnterprise
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
