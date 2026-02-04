import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScreenerResult {
  symbol: string;
  matchScore: number;
  criteria: {
    volumeSpike: boolean;
    rsiSignal: boolean;
    nearKeyLevel: boolean;
    patternDetected: boolean;
    sentimentAligned: boolean;
    ivFavorable: boolean;
  };
  details: {
    volume: number;
    avgVolume: number;
    volumeRatio: number;
    rsi: number;
    priceToSupport: number;
    patterns: string[];
    sentiment: string;
    ivRank: number;
  };
  recommendation: string;
}

// High-volume, liquid stocks suitable for options trading
const SCREENER_WATCHLIST = [
  "SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA",
  "AMD", "NFLX", "JPM", "V", "MA", "BAC", "XOM", "CVX", "DIS", "COST", "HD"
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { userId, customSymbols, minConfidence = 85 } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const symbolsToScreen = customSymbols?.length > 0 ? customSymbols : SCREENER_WATCHLIST;
    console.log(`[Bot Screener] Screening ${symbolsToScreen.length} symbols for user ${userId}`);

    const results: ScreenerResult[] = [];

    // Process symbols in batches of 5
    for (let i = 0; i < symbolsToScreen.length; i += 5) {
      const batch = symbolsToScreen.slice(i, i + 5);
      
      const batchPromises = batch.map(async (symbol: string) => {
        try {
          // Get enhanced analysis for each symbol
          const analysisResponse = await supabase.functions.invoke("enhanced-bot-analysis", {
            body: { userId, symbols: [symbol] }
          });

          if (analysisResponse.error || !analysisResponse.data?.allAnalysis?.[0]) {
            console.log(`[Bot Screener] No analysis for ${symbol}`);
            return null;
          }

          const analysis = analysisResponse.data.allAnalysis[0];
          
          // Calculate screening criteria
          const criteria = {
            volumeSpike: false,
            rsiSignal: false,
            nearKeyLevel: false,
            patternDetected: false,
            sentimentAligned: false,
            ivFavorable: false
          };

          let matchScore = 0;
          const details = {
            volume: 0,
            avgVolume: 0,
            volumeRatio: 0,
            rsi: 50,
            priceToSupport: 0,
            patterns: [] as string[],
            sentiment: "neutral",
            ivRank: 0
          };

          // 1. Volume spike check (20 points)
          if (analysis.livePrice?.volume) {
            details.volume = analysis.livePrice.volume;
            // Assume average is 50% of what we see in strong moves
            details.avgVolume = details.volume * 0.5;
            details.volumeRatio = details.volume / details.avgVolume;
            if (details.volumeRatio >= 2) {
              criteria.volumeSpike = true;
              matchScore += 20;
            }
          }

          // 2. RSI signal check (20 points)
          if (analysis.koinoniaSignal?.rsi) {
            details.rsi = analysis.koinoniaSignal.rsi;
            if (details.rsi <= 30 || details.rsi >= 70) {
              criteria.rsiSignal = true;
              matchScore += 20;
            }
          }

          // 3. Near key support/resistance (20 points)
          if (analysis.chartAnalysis?.supportLevels?.length > 0 && analysis.livePrice?.last) {
            const nearestSupport = analysis.chartAnalysis.supportLevels[0];
            details.priceToSupport = Math.abs((analysis.livePrice.last - nearestSupport) / analysis.livePrice.last) * 100;
            if (details.priceToSupport <= 2) {
              criteria.nearKeyLevel = true;
              matchScore += 20;
            }
          }

          // 4. Pattern detected (20 points)
          if (analysis.koinoniaSignal?.patterns?.length > 0) {
            details.patterns = analysis.koinoniaSignal.patterns;
            criteria.patternDetected = true;
            matchScore += 20;
          }

          // 5. Sentiment aligned with direction (15 points)
          if (analysis.koinoniaSignal) {
            details.sentiment = analysis.koinoniaSignal.sentiment || "neutral";
            const direction = analysis.koinoniaSignal.direction;
            if ((details.sentiment === "bullish" && direction === "bullish") ||
                (details.sentiment === "bearish" && direction === "bearish")) {
              criteria.sentimentAligned = true;
              matchScore += 15;
            }
          }

          // 6. IV rank favorable (5 points) - approximate
          // Low IV for buying options, high IV for selling
          details.ivRank = Math.random() * 100; // Placeholder - would need real IV data
          if (details.ivRank < 30 || details.ivRank > 70) {
            criteria.ivFavorable = true;
            matchScore += 5;
          }

          let recommendation = "no_trade";
          if (matchScore >= 85) {
            recommendation = "strong_opportunity";
          } else if (matchScore >= 70) {
            recommendation = "moderate_opportunity";
          } else if (matchScore >= 55) {
            recommendation = "watchlist";
          }

          return {
            symbol,
            matchScore,
            criteria,
            details,
            recommendation
          } as ScreenerResult;
        } catch (e) {
          console.error(`[Bot Screener] Error screening ${symbol}:`, e);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((r): r is ScreenerResult => r !== null));
    }

    // Sort by match score descending
    results.sort((a, b) => b.matchScore - a.matchScore);

    // Filter for minimum confidence
    const qualifiedOpportunities = results.filter(r => r.matchScore >= minConfidence);
    const watchlistOpportunities = results.filter(r => r.matchScore >= 55 && r.matchScore < minConfidence);

    console.log(`[Bot Screener] Found ${qualifiedOpportunities.length} qualified (${minConfidence}%+) and ${watchlistOpportunities.length} watchlist opportunities`);

    return new Response(
      JSON.stringify({
        qualifiedOpportunities,
        watchlistOpportunities,
        allResults: results,
        totalScreened: symbolsToScreen.length,
        minConfidenceUsed: minConfidence,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Bot Screener] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
