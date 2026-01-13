import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("[Trading Bot] Running scheduled check with enhanced screening...");

    // Get all users with enabled auto-trading
    const { data: activeSettings } = await supabase
      .from("auto_trading_settings")
      .select("*")
      .eq("enabled", true);

    if (!activeSettings || activeSettings.length === 0) {
      console.log("[Trading Bot] No active bots found");
      return new Response(
        JSON.stringify({ message: "No active trading bots" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Trading Bot] Found ${activeSettings.length} active bot(s)`);

    const results = [];

    // Process each user's bot
    for (const settings of activeSettings) {
      try {
        // Check if user has enterprise access
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", settings.user_id)
          .single();

        if (roleData?.role !== "enterprise") {
          console.log(`[Trading Bot] User ${settings.user_id} not enterprise, skipping`);
          continue;
        }

        // Check daily trade limit
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const { data: todayTrades } = await supabase
          .from("auto_trades_log")
          .select("*")
          .eq("user_id", settings.user_id)
          .gte("executed_at", today.toISOString());

        if (todayTrades && settings.max_daily_trades && todayTrades.length >= settings.max_daily_trades) {
          console.log(`[Trading Bot] User ${settings.user_id} reached daily limit`);
          continue;
        }

        // PHASE 1: Run the stock screener to find 90%+ opportunities
        console.log(`[Trading Bot] Running screener for user ${settings.user_id}...`);
        
        const { data: screenerData, error: screenerError } = await supabase.functions.invoke("bot-stock-screener", {
          body: {
            userId: settings.user_id,
            customSymbols: settings.allowed_symbols,
            minConfidence: 90
          },
        });

        if (screenerError) {
          console.error(`[Trading Bot] Screener error for user ${settings.user_id}:`, screenerError);
          results.push({
            userId: settings.user_id,
            status: "screener_error",
            error: screenerError.message,
          });
          continue;
        }

        const qualifiedOpportunities = screenerData?.qualifiedOpportunities || [];
        
        if (qualifiedOpportunities.length === 0) {
          console.log(`[Trading Bot] No 90%+ opportunities found for user ${settings.user_id}`);
          results.push({
            userId: settings.user_id,
            status: "no_opportunities",
            screenerStats: {
              totalScreened: screenerData?.totalScreened || 0,
              qualified: 0,
              watchlist: screenerData?.watchlistOpportunities?.length || 0
            }
          });
          continue;
        }

        console.log(`[Trading Bot] Found ${qualifiedOpportunities.length} qualified opportunities for user ${settings.user_id}`);

        // PHASE 2: Process top opportunities (max 3 per run to avoid rate limits)
        const opportunitiesToProcess = qualifiedOpportunities.slice(0, 3);
        const tradeResults = [];

        for (const opportunity of opportunitiesToProcess) {
          // Check trade limit again before each trade
          const { data: currentTrades } = await supabase
            .from("auto_trades_log")
            .select("*")
            .eq("user_id", settings.user_id)
            .gte("executed_at", today.toISOString());

          if (currentTrades && settings.max_daily_trades && currentTrades.length >= settings.max_daily_trades) {
            console.log(`[Trading Bot] Daily limit reached during processing for user ${settings.user_id}`);
            break;
          }

          // Get enhanced analysis for this specific symbol
          console.log(`[Trading Bot] Getting enhanced analysis for ${opportunity.symbol}...`);
          
          const { data: analysisData } = await supabase.functions.invoke("enhanced-bot-analysis", {
            body: {
              userId: settings.user_id,
              symbols: [opportunity.symbol]
            }
          });

          const enhancedAnalysis = analysisData?.allAnalysis?.[0];

          // Call auto-trading-bot with the pre-computed analysis
          console.log(`[Trading Bot] Calling auto-trading-bot for ${opportunity.symbol}...`);
          
          const { data: botData, error: botError } = await supabase.functions.invoke("auto-trading-bot", {
            body: {
              userId: settings.user_id,
              symbol: opportunity.symbol,
              action: "analyze",
              enhancedAnalysis
            },
          });

          if (botError) {
            console.error(`[Trading Bot] Bot error for ${opportunity.symbol}:`, botError);
            tradeResults.push({
              symbol: opportunity.symbol,
              status: "error",
              error: botError.message,
              matchScore: opportunity.matchScore
            });
          } else {
            console.log(`[Trading Bot] Bot result for ${opportunity.symbol}:`, botData?.decision);
            tradeResults.push({
              symbol: opportunity.symbol,
              status: "processed",
              decision: botData?.decision,
              compositeScore: botData?.compositeScore,
              analysisSourcesUsed: botData?.analysisSourcesUsed,
              matchScore: opportunity.matchScore
            });
          }

          // Small delay between trades to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        results.push({
          userId: settings.user_id,
          status: "success",
          screenerStats: {
            totalScreened: screenerData?.totalScreened || 0,
            qualified: qualifiedOpportunities.length,
            watchlist: screenerData?.watchlistOpportunities?.length || 0,
            processed: tradeResults.length
          },
          tradeResults
        });

      } catch (error) {
        console.error(`[Trading Bot] Exception for user ${settings.user_id}:`, error);
        results.push({
          userId: settings.user_id,
          status: "exception",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Calculate summary stats
    const summary = {
      totalBots: activeSettings.length,
      processed: results.filter(r => r.status === "success").length,
      noOpportunities: results.filter(r => r.status === "no_opportunities").length,
      errors: results.filter(r => r.status === "error" || r.status === "exception").length,
      totalTradesAttempted: results.reduce((acc, r) => acc + (r.tradeResults?.length || 0), 0)
    };

    console.log("[Trading Bot] Run completed:", summary);

    return new Response(
      JSON.stringify({
        message: "Trading bot run completed with enhanced screening",
        summary,
        results,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Trading Bot] Fatal error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
