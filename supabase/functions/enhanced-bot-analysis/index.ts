import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TradeSuggestion {
  symbol: string;
  action: string;
  confidence: number;
  targetPrice: number;
  reasoning: string;
}

interface StockAnalysisResult {
  symbol: string;
  analysis: string;
  recommendation?: string;
}

interface AnalysisResult {
  symbol: string;
  livePrice: {
    bid: number;
    ask: number;
    last: number;
    volume: number;
  } | null;
  koinoniaSignal: {
    direction: string;
    confidence: number;
    patterns: string[];
    rsi: number;
    ema9: number;
    ema20: number;
    sentiment: string;
    sentimentScore: number;
  } | null;
  chartAnalysis: {
    supportLevels: number[];
    resistanceLevels: number[];
    bounceZones: any[];
    keyLevel: number;
    predictedDirection: string;
  } | null;
  tradeSuggestion: TradeSuggestion | null;
  stockAnalysis: StockAnalysisResult | null;
  compositeScore: number;
  analysisSourcesUsed: string[];
  recommendation: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { userId, symbols } = await req.json();

    if (!userId || !symbols || !Array.isArray(symbols)) {
      return new Response(
        JSON.stringify({ error: "userId and symbols array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Enhanced Bot Analysis] Analyzing ${symbols.length} symbols for user ${userId}`);

    // Fetch global trade suggestions once (not per symbol)
    let globalTradeSuggestions: TradeSuggestion[] = [];
    try {
      const suggestionsResponse = await supabase.functions.invoke("generate-trade-suggestions", {
        body: {}
      });
      if (suggestionsResponse.data?.suggestions) {
        globalTradeSuggestions = suggestionsResponse.data.suggestions;
        console.log(`[Enhanced Bot Analysis] Got ${globalTradeSuggestions.length} global trade suggestions`);
      }
    } catch (e) {
      console.error("[Enhanced Bot Analysis] Error fetching trade suggestions:", e);
    }

    const results: AnalysisResult[] = [];

    for (const symbol of symbols.slice(0, 10)) { // Limit to 10 symbols
      const analysisSourcesUsed: string[] = [];
      let compositeScore = 0;
      let scoreComponents = 0;

      // 1. Fetch live price data
      let livePrice = null;
      try {
        const quoteResponse = await supabase.functions.invoke("schwab-quotes", {
          body: { symbols: [symbol], userId }
        });
        
        if (quoteResponse.data?.quotes?.[symbol]) {
          const quote = quoteResponse.data.quotes[symbol];
          livePrice = {
            bid: quote.bidPrice || quote.bid || 0,
            ask: quote.askPrice || quote.ask || 0,
            last: quote.lastPrice || quote.last || quote.regularMarketLastPrice || 0,
            volume: quote.totalVolume || quote.volume || 0
          };
          analysisSourcesUsed.push("live_quotes");
          console.log(`[Enhanced Bot Analysis] Got live price for ${symbol}: $${livePrice.last}`);
        }
      } catch (e) {
        console.error(`[Enhanced Bot Analysis] Error fetching live price for ${symbol}:`, e);
      }

      // 2. Fetch Koinonia Indicator signals
      let koinoniaSignal = null;
      try {
        const koinoniaResponse = await supabase.functions.invoke("koinonia-indicator", {
          body: { symbol, userId }
        });

        if (koinoniaResponse.data && !koinoniaResponse.error) {
          const data = koinoniaResponse.data;
          koinoniaSignal = {
            direction: data.signal?.direction || data.signals?.direction || "neutral",
            confidence: data.signal?.confidence || data.signals?.confidence || 0,
            patterns: data.candlestickPatterns?.map((p: any) => p.name) || [],
            rsi: data.technicalAnalysis?.rsi || data.indicators?.rsi || 50,
            ema9: data.technicalAnalysis?.ema9 || 0,
            ema20: data.technicalAnalysis?.ema20 || 0,
            sentiment: data.sentiment?.overall || "neutral",
            sentimentScore: data.sentiment?.score || 0
          };
          analysisSourcesUsed.push("koinonia_indicator");
          
          // Add to composite score (up to 30 points)
          compositeScore += koinoniaSignal.confidence * 30;
          scoreComponents++;
          
          console.log(`[Enhanced Bot Analysis] Koinonia signal for ${symbol}: ${koinoniaSignal.direction} (${koinoniaSignal.confidence})`);
        }
      } catch (e) {
        console.error(`[Enhanced Bot Analysis] Error fetching Koinonia for ${symbol}:`, e);
      }

      // 3. Fetch AI Chart Analysis
      let chartAnalysis = null;
      try {
        const chartResponse = await supabase.functions.invoke("ai-chart-analysis", {
          body: { symbol, userId, analysisType: "support_resistance" }
        });

        if (chartResponse.data && !chartResponse.error) {
          const data = chartResponse.data;
          chartAnalysis = {
            supportLevels: data.supportLevels || data.analysis?.supportLevels || [],
            resistanceLevels: data.resistanceLevels || data.analysis?.resistanceLevels || [],
            bounceZones: data.bounceZones || data.analysis?.bounceZones || [],
            keyLevel: data.keyLevel || data.analysis?.keyLevel || 0,
            predictedDirection: data.predictedDirection || data.analysis?.direction || "neutral"
          };
          analysisSourcesUsed.push("chart_analysis");
          
          // Add to composite score based on price proximity to key levels (up to 20 points)
          if (livePrice && chartAnalysis.supportLevels.length > 0) {
            const nearestSupport = chartAnalysis.supportLevels[0];
            const distanceToSupport = Math.abs((livePrice.last - nearestSupport) / livePrice.last);
            if (distanceToSupport < 0.02) { // Within 2% of support
              compositeScore += 20;
              scoreComponents++;
            } else if (distanceToSupport < 0.05) { // Within 5% of support
              compositeScore += 10;
              scoreComponents++;
            }
          }
          
          console.log(`[Enhanced Bot Analysis] Chart analysis for ${symbol}: ${chartAnalysis.predictedDirection}`);
        }
      } catch (e) {
        console.error(`[Enhanced Bot Analysis] Error fetching chart analysis for ${symbol}:`, e);
      }

      // 4. Check AI Trade Suggestions for this symbol
      let tradeSuggestion: TradeSuggestion | null = null;
      const matchingSuggestion = globalTradeSuggestions.find(
        s => s.symbol.toUpperCase() === symbol.toUpperCase()
      );
      if (matchingSuggestion) {
        tradeSuggestion = matchingSuggestion;
        analysisSourcesUsed.push("ai_trade_suggestions");
        
        // Add to composite score based on suggestion confidence (up to 20 points)
        compositeScore += (matchingSuggestion.confidence / 100) * 20;
        scoreComponents++;
        
        console.log(`[Enhanced Bot Analysis] Trade suggestion for ${symbol}: ${matchingSuggestion.action} (${matchingSuggestion.confidence}%)`);
      }

      // 5. Fetch AI Stock Analysis
      let stockAnalysis: StockAnalysisResult | null = null;
      try {
        const analysisResponse = await supabase.functions.invoke("analyze-stock", {
          body: { symbol, timeframe: "day trading" }
        });

        if (analysisResponse.data && !analysisResponse.error) {
          stockAnalysis = {
            symbol: analysisResponse.data.symbol,
            analysis: analysisResponse.data.analysis,
            recommendation: extractRecommendation(analysisResponse.data.analysis)
          };
          analysisSourcesUsed.push("ai_stock_analysis");
          
          // Add to composite score if analysis contains bullish/bearish signals (up to 15 points)
          const analysisLower = (stockAnalysis.analysis || "").toLowerCase();
          if (analysisLower.includes("strong buy") || analysisLower.includes("bullish")) {
            compositeScore += 15;
            scoreComponents++;
          } else if (analysisLower.includes("buy") || analysisLower.includes("call")) {
            compositeScore += 10;
            scoreComponents++;
          }
          
          console.log(`[Enhanced Bot Analysis] Stock analysis for ${symbol} completed`);
        }
      } catch (e) {
        console.error(`[Enhanced Bot Analysis] Error fetching stock analysis for ${symbol}:`, e);
      }

      // 6. Calculate final composite score
      // Add direction alignment bonus (up to 15 points)
      if (koinoniaSignal && chartAnalysis) {
        const directionsMatch = 
          (koinoniaSignal.direction === "bullish" && chartAnalysis.predictedDirection === "bullish") ||
          (koinoniaSignal.direction === "bearish" && chartAnalysis.predictedDirection === "bearish");
        
        if (directionsMatch) {
          compositeScore += 15;
          scoreComponents++;
        }
        
        // Sentiment alignment bonus
        if (koinoniaSignal.sentiment !== "neutral" && 
            ((koinoniaSignal.sentiment === "bullish" && koinoniaSignal.direction === "bullish") ||
             (koinoniaSignal.sentiment === "bearish" && koinoniaSignal.direction === "bearish"))) {
          compositeScore += 5;
        }
      }

      // Trade suggestion alignment bonus (up to 10 points)
      if (tradeSuggestion && koinoniaSignal) {
        const suggestionBullish = tradeSuggestion.action === "BUY";
        const signalBullish = koinoniaSignal.direction === "bullish";
        if (suggestionBullish === signalBullish) {
          compositeScore += 10;
        }
      }

      // Normalize composite score to 0-100
      const normalizedScore = scoreComponents > 0 ? Math.min(100, compositeScore) : 0;

      // Generate recommendation
      let recommendation = "pass";
      if (normalizedScore >= 90) {
        recommendation = "strong_buy_signal";
      } else if (normalizedScore >= 75) {
        recommendation = "moderate_signal";
      } else if (normalizedScore >= 60) {
        recommendation = "weak_signal";
      }

      results.push({
        symbol,
        livePrice,
        koinoniaSignal,
        chartAnalysis,
        tradeSuggestion,
        stockAnalysis,
        compositeScore: normalizedScore,
        analysisSourcesUsed,
        recommendation
      });
    }

    // Sort by composite score descending
    results.sort((a, b) => b.compositeScore - a.compositeScore);

    // Filter for 90%+ confidence opportunities
    const highConfidenceOpportunities = results.filter(r => r.compositeScore >= 90);

    console.log(`[Enhanced Bot Analysis] Found ${highConfidenceOpportunities.length} high-confidence opportunities`);

    return new Response(
      JSON.stringify({
        allAnalysis: results,
        highConfidenceOpportunities,
        globalTradeSuggestions,
        totalAnalyzed: symbols.length,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Enhanced Bot Analysis] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper function to extract recommendation from analysis text
function extractRecommendation(analysis: string): string {
  const lower = analysis.toLowerCase();
  if (lower.includes("strong buy") || lower.includes("highly recommend call")) {
    return "STRONG_BUY";
  } else if (lower.includes("buy") || lower.includes("call")) {
    return "BUY";
  } else if (lower.includes("strong sell") || lower.includes("highly recommend put")) {
    return "STRONG_SELL";
  } else if (lower.includes("sell") || lower.includes("put")) {
    return "SELL";
  } else if (lower.includes("hold") || lower.includes("neutral")) {
    return "HOLD";
  }
  return "NEUTRAL";
}
