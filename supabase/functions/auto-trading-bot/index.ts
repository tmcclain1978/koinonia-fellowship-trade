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
    const { userId, symbol, action } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    // Check if symbol is allowed
    if (settings.allowed_symbols && !settings.allowed_symbols.includes(symbol)) {
      return new Response(
        JSON.stringify({ error: "Symbol not in allowed list" }),
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
      return new Response(
        JSON.stringify({ error: "Daily trade limit reached" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get AI analysis for the symbol
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert trading AI for options trading. Analyze the symbol ${symbol} and provide a trading recommendation based on the action: ${action}. Consider risk tolerance: ${settings.risk_tolerance}. Provide specific entry price, quantity (not exceeding max position size: ${settings.max_position_size}), and reasoning.`,
          },
          {
            role: "user",
            content: `Should I ${action} ${symbol} right now? Provide entry price, quantity, and detailed reasoning.`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error("AI analysis failed");
    }

    const aiData = await aiResponse.json();
    const analysis = aiData.choices[0]?.message?.content;

    // Parse AI recommendation (this is simplified - in production you'd use structured output)
    const recommendation = {
      symbol,
      action,
      quantity: Math.min(100, settings.max_position_size || 100),
      price: 0, // Would be fetched from real market data
      reasoning: analysis,
    };

    // Log the trade
    const { data: tradeLog, error: logError } = await supabase
      .from("auto_trades_log")
      .insert({
        user_id: userId,
        symbol: recommendation.symbol,
        action: recommendation.action,
        quantity: recommendation.quantity,
        price: recommendation.price,
        reasoning: recommendation.reasoning,
        status: "pending",
      })
      .select()
      .single();

    if (logError) throw logError;

    // Here you would integrate with Schwab API to execute the actual trade
    // For now, we'll just return the recommendation

    return new Response(
      JSON.stringify({
        success: true,
        trade: tradeLog,
        recommendation,
        analysis,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in auto-trading bot:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});