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

const BATCH_SIZE = 4; // Process 4 symbols concurrently

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
    const startTime = Date.now();

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

    // Helper function to analyze a single symbol with parallel data fetching
    async function analyzeSymbol(symbol: string): Promise<AnalysisResult> {
      const analysisSourcesUsed: string[] = [];
      let compositeScore = 0;
      let scoreComponents = 0;

      // Fetch all data sources in PARALLEL for this symbol
      const [livePriceResult, koinoniaResult, chartResult, stockResult] = await Promise.allSettled([
        // 1. Live Price
        supabase.functions.invoke("schwab-quotes", {
          body: { symbols: [symbol], userId }
        }),
        // 2. Koinonia Indicator
        supabase.functions.invoke("koinonia-indicator", {
          body: { symbol, userId }
        }),
        // 3. Chart Analysis
        supabase.functions.invoke("ai-chart-analysis", {
          body: { symbol, userId, analysisType: "support_resistance" }
        }),
        // 4. Stock Analysis
        supabase.functions.invoke("analyze-stock", {
          body: { symbol, timeframe: "day trading" }
        })
      ]);

      // Process live price
      let livePrice = null;
      if (livePriceResult.status === "fulfilled" && livePriceResult.value.data?.quotes?.[symbol]) {
        const quote = livePriceResult.value.data.quotes[symbol];
        livePrice = {
          bid: quote.bidPrice || quote.bid || 0,
          ask: quote.askPrice || quote.ask || 0,
          last: quote.lastPrice || quote.last || quote.regularMarketLastPrice || 0,
          volume: quote.totalVolume || quote.volume || 0
        };
        analysisSourcesUsed.push("live_quotes");
        console.log(`[Enhanced Bot Analysis] Got live price for ${symbol}: $${livePrice.last}`);
      }

      // Process Koinonia signal
      let koinoniaSignal = null;
      if (koinoniaResult.status === "fulfilled" && koinoniaResult.value.data && !koinoniaResult.value.error) {
        const data = koinoniaResult.value.data;
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
        compositeScore += koinoniaSignal.confidence * 30;
        scoreComponents++;
        console.log(`[Enhanced Bot Analysis] Koinonia signal for ${symbol}: ${koinoniaSignal.direction}`);
      }

      // Process chart analysis
      let chartAnalysis = null;
      if (chartResult.status === "fulfilled" && chartResult.value.data && !chartResult.value.error) {
        const data = chartResult.value.data;
        chartAnalysis = {
          supportLevels: data.supportLevels || data.analysis?.supportLevels || [],
          resistanceLevels: data.resistanceLevels || data.analysis?.resistanceLevels || [],
          bounceZones: data.bounceZones || data.analysis?.bounceZones || [],
          keyLevel: data.keyLevel || data.analysis?.keyLevel || 0,
          predictedDirection: data.predictedDirection || data.analysis?.direction || "neutral"
        };
        analysisSourcesUsed.push("chart_analysis");
        
        if (livePrice && chartAnalysis.supportLevels.length > 0) {
          const nearestSupport = chartAnalysis.supportLevels[0];
          const distanceToSupport = Math.abs((livePrice.last - nearestSupport) / livePrice.last);
          if (distanceToSupport < 0.02) {
            compositeScore += 20;
            scoreComponents++;
          } else if (distanceToSupport < 0.05) {
            compositeScore += 10;
            scoreComponents++;
          }
        }
        console.log(`[Enhanced Bot Analysis] Chart analysis for ${symbol}: ${chartAnalysis.predictedDirection}`);
      }

      // Check trade suggestions for this symbol
      let tradeSuggestion: TradeSuggestion | null = null;
      const matchingSuggestion = globalTradeSuggestions.find(
        s => s.symbol.toUpperCase() === symbol.toUpperCase()
      );
      if (matchingSuggestion) {
        tradeSuggestion = matchingSuggestion;
        analysisSourcesUsed.push("ai_trade_suggestions");
        compositeScore += (matchingSuggestion.confidence / 100) * 20;
        scoreComponents++;
        console.log(`[Enhanced Bot Analysis] Trade suggestion for ${symbol}: ${matchingSuggestion.action}`);
      }

      // Process stock analysis
      let stockAnalysis: StockAnalysisResult | null = null;
      if (stockResult.status === "fulfilled" && stockResult.value.data && !stockResult.value.error) {
        stockAnalysis = {
          symbol: stockResult.value.data.symbol,
          analysis: stockResult.value.data.analysis,
          recommendation: extractRecommendation(stockResult.value.data.analysis)
        };
        analysisSourcesUsed.push("ai_stock_analysis");
        
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

      // Direction alignment bonus
      if (koinoniaSignal && chartAnalysis) {
        const directionsMatch = 
          (koinoniaSignal.direction === "bullish" && chartAnalysis.predictedDirection === "bullish") ||
          (koinoniaSignal.direction === "bearish" && chartAnalysis.predictedDirection === "bearish");
        
        if (directionsMatch) {
          compositeScore += 15;
          scoreComponents++;
        }
        
        if (koinoniaSignal.sentiment !== "neutral" && 
            ((koinoniaSignal.sentiment === "bullish" && koinoniaSignal.direction === "bullish") ||
             (koinoniaSignal.sentiment === "bearish" && koinoniaSignal.direction === "bearish"))) {
          compositeScore += 5;
        }
      }

      // Trade suggestion alignment bonus
      if (tradeSuggestion && koinoniaSignal) {
        const suggestionBullish = tradeSuggestion.action === "BUY";
        const signalBullish = koinoniaSignal.direction === "bullish";
        if (suggestionBullish === signalBullish) {
          compositeScore += 10;
        }
      }

      const normalizedScore = scoreComponents > 0 ? Math.min(100, compositeScore) : 0;

      let recommendation = "pass";
      if (normalizedScore >= 85) {
        recommendation = "strong_buy_signal";
      } else if (normalizedScore >= 75) {
        recommendation = "moderate_signal";
      } else if (normalizedScore >= 60) {
        recommendation = "weak_signal";
      }

      return {
        symbol,
        livePrice,
        koinoniaSignal,
        chartAnalysis,
        tradeSuggestion,
        stockAnalysis,
        compositeScore: normalizedScore,
        analysisSourcesUsed,
        recommendation
      };
    }

    // Process symbols in batches for parallelization
    const symbolsToProcess = symbols.slice(0, 10);
    const results: AnalysisResult[] = [];

    for (let i = 0; i < symbolsToProcess.length; i += BATCH_SIZE) {
      const batch = symbolsToProcess.slice(i, i + BATCH_SIZE);
      console.log(`[Enhanced Bot Analysis] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.join(", ")}`);
      
      const batchResults = await Promise.all(batch.map(symbol => analyzeSymbol(symbol)));
      results.push(...batchResults);
    }

    // Sort by composite score descending
    results.sort((a, b) => b.compositeScore - a.compositeScore);

    // Filter for 85%+ confidence opportunities (lowered from 90%)
    const highConfidenceOpportunities = results.filter(r => r.compositeScore >= 85);

    const totalTime = Date.now() - startTime;
    console.log(`[Enhanced Bot Analysis] Completed in ${totalTime}ms. Found ${highConfidenceOpportunities.length} high-confidence opportunities`);

    return new Response(
      JSON.stringify({
        allAnalysis: results,
        highConfidenceOpportunities,
        globalTradeSuggestions,
        totalAnalyzed: symbols.length,
        processingTimeMs: totalTime,
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
function extractRecommendation(analysis: string | null | undefined): string {
  if (!analysis) return "NEUTRAL";
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
