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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("[Learning] Starting daily analysis...");

    // Get user ID from request or analyze all premium users (enterprise and admin)
    const { userId } = await req.json().catch(() => ({}));
    
    let usersToAnalyze;
    if (userId) {
      // Analyze specific user
      usersToAnalyze = [{ user_id: userId }];
    } else {
      // Get all users with enterprise or admin role
      const { data: premiumUsers } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["enterprise", "admin"]);
      
      usersToAnalyze = premiumUsers || [];
    }

    if (usersToAnalyze.length === 0) {
      return new Response(
        JSON.stringify({ message: "No users to analyze" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const user of usersToAnalyze) {
      try {
        // Get today's completed trades
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data: todayPerformance } = await supabase
          .from("bot_performance_log")
          .select("*")
          .eq("user_id", user.user_id)
          .gte("trade_opened_at", today.toISOString())
          .not("trade_closed_at", "is", null);

        if (!todayPerformance || todayPerformance.length === 0) {
          console.log(`[Learning] No completed trades for user ${user.user_id}`);
          continue;
        }

        // Calculate metrics
        const ivRegimeAccuracy = todayPerformance.filter(t => t.regime_correct).length / todayPerformance.length;
        const avgProfitFactor = todayPerformance.reduce((acc, t) => acc + (t.profit_factor || 0), 0) / todayPerformance.length;
        const avgDisciplineScore = todayPerformance.reduce((acc, t) => acc + (t.discipline_score || 0), 0) / todayPerformance.length;
        const avgSlippage = todayPerformance.reduce((acc, t) => acc + Math.abs(t.slippage || 0), 0) / todayPerformance.length;

        // Generate AI insights
        const analysisPrompt = `As Koinonia AI Trader coach, analyze these trading metrics and provide 3 key insights:

Today's Performance:
- Trades analyzed: ${todayPerformance.length}
- IV regime accuracy: ${(ivRegimeAccuracy * 100).toFixed(1)}% (target: 80%)
- Avg profit factor: ${avgProfitFactor.toFixed(2)}
- Avg discipline score: ${avgDisciplineScore.toFixed(2)}/1.0
- Avg slippage: ${(avgSlippage * 100).toFixed(2)}%

Provide:
1. Three key insights (as an array of strings)
2. Strategy adjustments recommendation
3. Risk observations

Keep the tone like a trading coach: calm, direct, instructive.`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You are Koinonia AI Trader, a trading coach who provides concise, actionable insights." },
              { role: "user", content: analysisPrompt }
            ],
            tools: [{
              type: "function",
              function: {
                name: "learning_insights",
                description: "Generate daily learning insights",
                parameters: {
                  type: "object",
                  properties: {
                    key_insights: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 3,
                      maxItems: 3
                    },
                    strategy_adjustments: { type: "string" },
                    risk_observations: { type: "string" }
                  },
                  required: ["key_insights", "strategy_adjustments", "risk_observations"],
                  additionalProperties: false
                }
              }
            }],
            tool_choice: { type: "function", function: { name: "learning_insights" } }
          }),
        });

        if (!aiResponse.ok) {
          console.error(`[Learning] AI request failed for user ${user.user_id}`);
          continue;
        }

        const aiData = await aiResponse.json();
        const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
        
        if (!toolCall) {
          console.error(`[Learning] No tool call returned for user ${user.user_id}`);
          continue;
        }

        const insights = JSON.parse(toolCall.function.arguments);

        // Store learning insights
        await supabase.from("bot_learning_insights").upsert({
          user_id: user.user_id,
          insight_date: today.toISOString().split('T')[0],
          trades_analyzed: todayPerformance.length,
          iv_regime_accuracy: ivRegimeAccuracy,
          avg_profit_factor: avgProfitFactor,
          avg_discipline_score: avgDisciplineScore,
          avg_slippage: avgSlippage,
          key_insights: insights.key_insights,
          strategy_adjustments: insights.strategy_adjustments,
          risk_observations: insights.risk_observations
        }, {
          onConflict: "user_id,insight_date"
        });

        console.log(`[Learning] Generated insights for user ${user.user_id}`);
        results.push({
          userId: user.user_id,
          status: "success",
          insights
        });
      } catch (error) {
        console.error(`[Learning] Error for user ${user.user_id}:`, error);
        results.push({
          userId: user.user_id,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: "Learning analysis completed",
        processed: results.length,
        results
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Learning] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
