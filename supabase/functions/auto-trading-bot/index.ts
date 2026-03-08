import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import botConfig from "../_shared/trading-bot-config.json" assert { type: "json" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PRICE_DEVIATION_PERCENT = 2;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, symbol, action, enhancedAnalysis, tradingMode } = await req.json();
    
    // Dynamic confidence threshold: lower for paper trading since data may be mock
    const MINIMUM_CONFIDENCE = tradingMode === "paper" ? 0.50 : 0.90;
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[Bot] Processing request for user ${userId}, symbol ${symbol}, action ${action}`);

    // Check if user has enterprise subscription
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (roleData?.role !== "enterprise" && roleData?.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Enterprise subscription required for auto-trading" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's auto-trading settings
    const { data: settings } = await supabase
      .from("auto_trading_settings")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!settings?.enabled) {
      return new Response(
        JSON.stringify({ error: "Auto-trading is not enabled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PHASE 1: Get enhanced analysis if not provided
    let analysis = enhancedAnalysis;
    if (!analysis) {
      console.log("[Bot] Fetching enhanced analysis...");
      const analysisResponse = await supabase.functions.invoke("enhanced-bot-analysis", {
        body: { userId, symbols: [symbol] }
      });
      
      if (analysisResponse.error) {
        console.error("[Bot] Enhanced analysis error:", analysisResponse.error);
      } else {
        analysis = analysisResponse.data?.allAnalysis?.[0];
      }
    }

    // Track which analysis sources were used
    const analysisSourcesUsed: string[] = analysis?.analysisSourcesUsed || [];
    const koinoniaSignalUsed = analysisSourcesUsed.includes("koinonia_indicator");
    const chartAnalysisUsed = analysisSourcesUsed.includes("chart_analysis");

    // PHASE 2: Check composite score against 90% threshold
    const compositeScore = analysis?.compositeScore || 0;
    if (compositeScore < MINIMUM_CONFIDENCE * 100) {
      console.log(`[Bot] Composite score ${compositeScore}% below ${MINIMUM_CONFIDENCE * 100}% threshold`);
      
      await supabase.from("auto_trades_log").insert({
        user_id: userId,
        symbol,
        action: "pass",
        quantity: 0,
        price: 0,
        status: "confidence_below_threshold",
        reasoning: `Confidence score ${compositeScore}% is below the required ${MINIMUM_CONFIDENCE * 100}% threshold. Analysis sources: ${analysisSourcesUsed.join(", ") || "none"}`
      });

      return new Response(
        JSON.stringify({
          success: true,
          decision: "pass",
          reasoning: `Confidence score ${compositeScore}% is below the required 90% threshold`,
          compositeScore,
          analysisSourcesUsed
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PHASE 3: Get live price for validation
    let livePrice = analysis?.livePrice?.last || 0;
    if (!livePrice) {
      try {
        const quoteResponse = await supabase.functions.invoke("schwab-quotes", {
          body: { symbols: [symbol], userId }
        });
        if (quoteResponse.data?.quotes?.[symbol]) {
          const quote = quoteResponse.data.quotes[symbol];
          livePrice = quote.lastPrice || quote.last || quote.regularMarketLastPrice || 0;
        }
      } catch (e) {
        console.error("[Bot] Error fetching live quote:", e);
      }
    }

    // Get bot's learning history for this strategy
    const { data: strategyStats } = await supabase
      .from("bot_strategy_stats")
      .select("*")
      .eq("user_id", userId);

    // Get recent performance to inform the AI
    const { data: recentPerformance } = await supabase
      .from("bot_performance_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Calculate performance metrics
    const performanceContext = recentPerformance?.length
      ? `Recent Performance:\n- Total trades: ${recentPerformance.length}\n- Avg discipline score: ${
          (recentPerformance.reduce((acc, t) => acc + (t.discipline_score || 0), 0) / recentPerformance.length).toFixed(2)
        }\n- IV regime accuracy: ${
          ((recentPerformance.filter(t => t.regime_correct).length / recentPerformance.length) * 100).toFixed(1)
        }%`
      : "No recent performance data";

    // Check symbol allowlist
    if (settings.allowed_symbols && !settings.allowed_symbols.includes(symbol)) {
      console.log(`[Bot] Symbol ${symbol} not in allowed list`);
      return new Response(
        JSON.stringify({ 
          error: "Symbol not in allowed list",
          reasoning: "Risk management: This symbol is not in your approved trading list."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check daily trade limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: todayTrades } = await supabase
      .from("auto_trades_log")
      .select("*")
      .eq("user_id", userId)
      .gte("executed_at", today.toISOString());

    if (settings.max_daily_trades && todayTrades && todayTrades.length >= settings.max_daily_trades) {
      console.log(`[Bot] Daily limit reached for user ${userId}`);
      return new Response(
        JSON.stringify({ 
          error: "Daily trade limit reached",
          reasoning: "Discipline beats prediction. We've hit our daily limit to protect capital."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PHASE 4: Build enhanced AI prompt with all analysis data
    const koinoniaContext = analysis?.koinoniaSignal
      ? `\nKOINONIA INDICATOR DATA:
- Direction: ${analysis.koinoniaSignal.direction}
- Confidence: ${(analysis.koinoniaSignal.confidence * 100).toFixed(1)}%
- RSI: ${analysis.koinoniaSignal.rsi}
- EMA9: ${analysis.koinoniaSignal.ema9}
- EMA20: ${analysis.koinoniaSignal.ema20}
- Patterns Detected: ${analysis.koinoniaSignal.patterns?.join(", ") || "none"}
- News Sentiment: ${analysis.koinoniaSignal.sentiment} (score: ${analysis.koinoniaSignal.sentimentScore})`
      : "\nKOINONIA INDICATOR: No data available";

    const chartContext = analysis?.chartAnalysis
      ? `\nCHART ANALYSIS DATA:
- Key Support Levels: ${analysis.chartAnalysis.supportLevels?.slice(0, 3).join(", ") || "none"}
- Key Resistance Levels: ${analysis.chartAnalysis.resistanceLevels?.slice(0, 3).join(", ") || "none"}
- Predicted Direction: ${analysis.chartAnalysis.predictedDirection}
- Key Level: ${analysis.chartAnalysis.keyLevel}`
      : "\nCHART ANALYSIS: No data available";

    const liveDataContext = livePrice
      ? `\nLIVE MARKET DATA:
- Current Price: $${livePrice}
- Bid: $${analysis?.livePrice?.bid || "N/A"}
- Ask: $${analysis?.livePrice?.ask || "N/A"}
- Volume: ${analysis?.livePrice?.volume || "N/A"}`
      : "\nLIVE MARKET DATA: Not available";

    const systemPrompt = `${botConfig.system_prompt}

CONFIDENCE GATE ENFORCED:
- Minimum confidence required: ${MINIMUM_CONFIDENCE * 100}%
- Current composite score: ${compositeScore}%
- Max price deviation allowed: ${MAX_PRICE_DEVIATION_PERCENT}%

CURRENT USER SETTINGS:
- Risk Tolerance: ${settings.risk_tolerance}
- Max Position Size: ${settings.max_position_size}
- Max Daily Trades: ${settings.max_daily_trades}
- Allowed Symbols: ${settings.allowed_symbols?.join(", ") || "All"}

${performanceContext}
${koinoniaContext}
${chartContext}
${liveDataContext}

ANALYSIS SOURCES USED: ${analysisSourcesUsed.join(", ") || "none"}
COMPOSITE CONFIDENCE SCORE: ${compositeScore}%

POLICY ENFORCEMENT:
${JSON.stringify(botConfig.policy, null, 2)}

CRITICAL RULES:
1. Only execute if composite score >= 90%
2. Entry price must be within ${MAX_PRICE_DEVIATION_PERCENT}% of live price
3. Pattern/sentiment must align with trade direction
4. All analysis sources should be considered in reasoning

You must analyze ${symbol} and decide whether to ${action}. Follow the workflow:
1. Review all analysis sources (Koinonia, Chart, Live Data)
2. Verify confidence meets 90% threshold
3. Validate price alignment with live data
4. Confirm pattern/sentiment alignment
5. Present trade card with detailed reasoning

Respond with JSON in this format:
{
  "decision": "execute" | "pass",
  "strategy": "bull_put_spread" | "iron_condor" | etc,
  "entry_price": number,
  "quantity": number,
  "stop_loss": number,
  "target_price": number,
  "confidence_score": 0-1,
  "regime_classification": "low_iv" | "high_iv" | "neutral",
  "iv_rank": number,
  "pop_predicted": number,
  "discipline_score": 0-1,
  "reasoning": "detailed explanation referencing analysis sources",
  "coaching_insight": "what the trader should learn",
  "patterns_used": ["array", "of", "patterns"],
  "sentiment_direction": "bullish" | "bearish" | "neutral"
}`;

    console.log("[Bot] Calling AI with enhanced analysis context...");

    // Call AI with structured output using tool calling
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: `Analyze ${symbol} for ${action}. Composite score: ${compositeScore}%. Live price: $${livePrice}. Review all analysis data and make your decision.` 
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "trade_decision",
            description: "Return a structured trading decision with all required fields",
            parameters: {
              type: "object",
              properties: {
                decision: { type: "string", enum: ["execute", "pass"] },
                strategy: { type: "string" },
                entry_price: { type: "number" },
                quantity: { type: "number" },
                stop_loss: { type: "number" },
                target_price: { type: "number" },
                confidence_score: { type: "number" },
                regime_classification: { type: "string", enum: ["low_iv", "high_iv", "neutral"] },
                iv_rank: { type: "number" },
                pop_predicted: { type: "number" },
                discipline_score: { type: "number" },
                reasoning: { type: "string" },
                coaching_insight: { type: "string" },
                patterns_used: { type: "array", items: { type: "string" } },
                sentiment_direction: { type: "string", enum: ["bullish", "bearish", "neutral"] }
              },
              required: ["decision", "reasoning", "coaching_insight", "confidence_score"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "trade_decision" } }
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error("AI did not return structured decision");
    }

    const recommendation = JSON.parse(toolCall.function.arguments);
    console.log("[Bot] AI Recommendation:", recommendation);

    // PHASE 5: Validate AI confidence matches our threshold
    if (recommendation.confidence_score < MINIMUM_CONFIDENCE) {
      console.log(`[Bot] AI confidence ${recommendation.confidence_score} below threshold`);
      
      await supabase.from("auto_trades_log").insert({
        user_id: userId,
        symbol,
        action: "pass",
        quantity: 0,
        price: 0,
        status: "ai_confidence_low",
        reasoning: recommendation.reasoning
      });

      return new Response(
        JSON.stringify({
          success: true,
          decision: "pass",
          reasoning: `AI confidence ${(recommendation.confidence_score * 100).toFixed(1)}% is below 90% threshold`,
          compositeScore,
          aiConfidence: recommendation.confidence_score,
          analysisSourcesUsed
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If bot decides to pass, return with reasoning
    if (recommendation.decision === "pass") {
      console.log("[Bot] AI decided to pass on this trade");
      
      await supabase.from("auto_trades_log").insert({
        user_id: userId,
        symbol,
        action: "pass",
        quantity: 0,
        price: 0,
        status: "passed",
        reasoning: recommendation.reasoning
      });

      return new Response(
        JSON.stringify({
          success: true,
          decision: "pass",
          reasoning: recommendation.reasoning,
          coaching_insight: recommendation.coaching_insight,
          compositeScore,
          analysisSourcesUsed
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PHASE 6: Validate entry price against live price
    if (livePrice && recommendation.entry_price) {
      const priceDeviation = Math.abs((recommendation.entry_price - livePrice) / livePrice) * 100;
      if (priceDeviation > MAX_PRICE_DEVIATION_PERCENT) {
        console.log(`[Bot] Price deviation ${priceDeviation.toFixed(2)}% exceeds ${MAX_PRICE_DEVIATION_PERCENT}%`);
        
        await supabase.from("auto_trades_log").insert({
          user_id: userId,
          symbol,
          action: "pass",
          quantity: 0,
          price: recommendation.entry_price,
          status: "price_deviation",
          reasoning: `Entry price $${recommendation.entry_price} deviates ${priceDeviation.toFixed(2)}% from live price $${livePrice}`
        });

        return new Response(
          JSON.stringify({
            success: true,
            decision: "pass",
            reasoning: `Entry price deviation ${priceDeviation.toFixed(2)}% exceeds maximum ${MAX_PRICE_DEVIATION_PERCENT}%`,
            entryPrice: recommendation.entry_price,
            livePrice,
            compositeScore
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate against policy before executing
    const positionSize = recommendation.entry_price * recommendation.quantity;
    if (positionSize > settings.max_position_size) {
      console.log("[Bot] Position size exceeds limit");
      return new Response(
        JSON.stringify({ 
          error: "Position size exceeds limit",
          reasoning: "Risk management block. Position size would exceed your maximum."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PHASE 7: Execute the trade
    console.log("[Bot] Executing trade...");
    const executeResponse = await supabase.functions.invoke("execute-trade", {
      body: {
        userId,
        symbol: recommendation.symbol || symbol,
        action,
        quantity: recommendation.quantity,
        price: recommendation.entry_price,
      },
    });

    if (executeResponse.error) {
      throw new Error(`Trade execution failed: ${executeResponse.error.message}`);
    }

    // Log performance tracking with enhanced data
    const tradeLog = await supabase.from("auto_trades_log")
      .select("id")
      .eq("user_id", userId)
      .order("executed_at", { ascending: false })
      .limit(1)
      .single();
    
    // Build confidence breakdown
    const confidenceBreakdown = {
      composite: compositeScore,
      aiConfidence: recommendation.confidence_score * 100,
      koinoniaConfidence: analysis?.koinoniaSignal?.confidence ? analysis.koinoniaSignal.confidence * 100 : null,
      patternCount: recommendation.patterns_used?.length || 0,
      sentimentAlignment: recommendation.sentiment_direction
    };

    await supabase.from("bot_performance_log").insert({
      user_id: userId,
      trade_id: tradeLog.data?.id,
      symbol,
      strategy: recommendation.strategy,
      entry_price: recommendation.entry_price,
      quantity: recommendation.quantity,
      pop_predicted: recommendation.pop_predicted,
      iv_rank_entry: recommendation.iv_rank,
      regime_classification: recommendation.regime_classification,
      discipline_score: recommendation.discipline_score,
      expected_rr: recommendation.target_price && recommendation.stop_loss 
        ? (recommendation.target_price - recommendation.entry_price) / (recommendation.entry_price - recommendation.stop_loss)
        : null,
      trade_opened_at: new Date().toISOString(),
      // New enhanced tracking fields
      koinonia_signal_used: koinoniaSignalUsed,
      chart_analysis_used: chartAnalysisUsed,
      live_price_at_entry: livePrice,
      screener_match_score: compositeScore,
      patterns_detected: recommendation.patterns_used || analysis?.koinoniaSignal?.patterns || [],
      sentiment_at_entry: recommendation.sentiment_direction || analysis?.koinoniaSignal?.sentiment,
      confidence_breakdown: confidenceBreakdown,
      analysis_sources: analysisSourcesUsed
    });

    // Update strategy stats
    try {
      await supabase.rpc("upsert_strategy_stats", {
        p_user_id: userId,
        p_strategy: recommendation.strategy
      });
    } catch (e) {
      console.error("[Bot] Error updating strategy stats:", e);
    }

    console.log("[Bot] Trade executed successfully with enhanced tracking");

    return new Response(
      JSON.stringify({
        success: true,
        decision: "execute",
        trade: executeResponse.data,
        recommendation,
        coaching_insight: recommendation.coaching_insight,
        compositeScore,
        analysisSourcesUsed,
        confidenceBreakdown,
        livePrice
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Bot] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
