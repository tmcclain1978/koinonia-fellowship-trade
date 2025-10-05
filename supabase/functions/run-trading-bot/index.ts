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

    console.log("[Trading Bot] Running scheduled check...");

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

        // Run the auto-trading bot for this user
        const { data, error } = await supabase.functions.invoke("auto-trading-bot", {
          body: {
            userId: settings.user_id,
            symbol: "SPY", // Default symbol, bot will analyze and decide
            action: "analyze",
          },
        });

        if (error) {
          console.error(`[Trading Bot] Error for user ${settings.user_id}:`, error);
          results.push({
            userId: settings.user_id,
            status: "error",
            error: error.message,
          });
        } else {
          console.log(`[Trading Bot] Success for user ${settings.user_id}`);
          results.push({
            userId: settings.user_id,
            status: "success",
            data,
          });
        }
      } catch (error) {
        console.error(`[Trading Bot] Exception for user ${settings.user_id}:`, error);
        results.push({
          userId: settings.user_id,
          status: "exception",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: "Trading bot run completed",
        processed: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[Trading Bot] Fatal error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});