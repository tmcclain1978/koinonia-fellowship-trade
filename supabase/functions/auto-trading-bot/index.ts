import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import botConfig from "../_shared/trading-bot-config.json" assert { type: "json" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, symbol, action } = await req.json();
    
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

    if (roleData?.role !== "enterprise") {
      return new Response(
        JSON.stringify({ error: "Enterprise subscription required for auto-trading" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
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
    const performanceContext = recentPerformance 
      ? `Recent Performance:\n- Total trades: ${recentPerformance.length}\n- Avg discipline score: ${
          recentPerformance.reduce((acc, t) => acc + (t.discipline_score || 0), 0) / recentPerformance.length
        }\n- IV regime accuracy: ${
          recentPerformance.filter(t => t.regime_correct).length / recentPerformance.length
        }`
      : "No recent performance data";

    // Check symbol allowlist
    if (settings.allowed_symbols && !settings.allowed_symbols.includes(symbol)) {
      console.log(`[Bot] Symbol ${symbol} not in allowed list`);
      return new Response(
        JSON.stringify({ 
          error: "Symbol not in allowed list",
          reasoning: "Risk management: This symbol is not in your approved trading list."
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Build the AI trading coach prompt with learning context
    const systemPrompt = `${botConfig.system_prompt}

CURRENT USER SETTINGS:
- Risk Tolerance: ${settings.risk_tolerance}
- Max Position Size: ${settings.max_position_size}
- Max Daily Trades: ${settings.max_daily_trades}
- Allowed Symbols: ${settings.allowed_symbols?.join(", ") || "All"}

${performanceContext}

POLICY ENFORCEMENT:
${JSON.stringify(botConfig.policy, null, 2)}

You must analyze ${symbol} and decide whether to ${action}. Follow the workflow:
1. Scan regime (classify volatility)
2. Select setup (choose best strategy from allowed list)
3. Validate (check risk, liquidity, correlation)
4. Present trade card with reasoning
5. Return structured JSON with your decision

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
  "reasoning": "detailed explanation",
  "coaching_insight": "what the trader should learn"
}`;

    console.log("[Bot] Calling AI with enhanced coaching prompt...");

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
            content: `Analyze ${symbol} for ${action}. Current market conditions require your expert assessment.` 
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
                coaching_insight: { type: "string" }
              },
              required: ["decision", "reasoning", "coaching_insight"],
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

    // If bot decides to pass, return with reasoning
    if (recommendation.decision === "pass") {
      console.log("[Bot] AI decided to pass on this trade");
      
      // Log the decision for learning
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
          coaching_insight: recommendation.coaching_insight
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // Execute the trade
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

    // Log performance tracking
    const tradeLog = await supabase.from("auto_trades_log").select("id").eq("user_id", userId).order("executed_at", { ascending: false }).limit(1).single();
    
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
      expected_rr: (recommendation.target_price - recommendation.entry_price) / (recommendation.entry_price - recommendation.stop_loss),
      trade_opened_at: new Date().toISOString()
    });

    // Update strategy stats
    await supabase.rpc("upsert_strategy_stats", {
      p_user_id: userId,
      p_strategy: recommendation.strategy
    });

    console.log("[Bot] Trade executed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        decision: "execute",
        trade: executeResponse.data,
        recommendation,
        coaching_insight: recommendation.coaching_insight
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Bot] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
