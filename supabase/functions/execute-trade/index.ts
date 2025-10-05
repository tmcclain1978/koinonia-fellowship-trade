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
    // Get authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the user's JWT and get their user ID
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Invalid authentication token");
    }

    const userId = user.id;

    // Get trade parameters from request body
    const { symbol, action, quantity, price } = await req.json();

    // Check PDT status before executing trade (only for live accounts)
    const { data: credentialsData, error: credError } = await supabase.functions.invoke(
      "encrypt-credentials",
      {
        body: { operation: "load" },
        headers: { Authorization: authHeader },
      }
    );
    
    const credentials = credentialsData?.credentials;
    const isPaperTrading = credentials?.trading_mode === "paper";

    // Only check PDT for live trading
    if (!isPaperTrading) {
      const { data: pdtCheck, error: pdtError } = await supabase.functions.invoke(
        'check-pdt-status',
        {
          body: { symbol, isSell: action.toLowerCase() === 'sell' },
          headers: { Authorization: authHeader }
        }
      );

      if (pdtError) {
        console.error('PDT check failed:', pdtError);
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Failed to verify Pattern Day Trading status'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If trade is blocked by PDT rules
      if (!pdtCheck.canTrade) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: pdtCheck.message || 'Trade blocked by Pattern Day Trading rules',
            pdtBlocked: true,
            dayTradeCount: pdtCheck.dayTradeCount,
            accountValue: pdtCheck.accountValue
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Store warning if present (but allow trade)
      var pdtWarning = pdtCheck.warning ? pdtCheck.message : null;
    }

    // Credentials already loaded above for PDT check
    if (!credentials || !credentials.schwab_client_id) {
      throw new Error("Schwab API credentials not configured");
    }

    let tradeResult;

    if (isPaperTrading) {
      // Simulate trade execution for paper trading
      console.log(`[PAPER TRADE] ${action} ${quantity} ${symbol} @ $${price}`);
      tradeResult = {
        success: true,
        orderId: `PAPER-${Date.now()}`,
        executedPrice: price,
        message: "Paper trade executed successfully",
      };
    } else {
      // Real trade execution via Schwab API
      // NOTE: This is a placeholder - actual Schwab API integration would go here
      // You would need to:
      // 1. Get OAuth token using refresh token
      // 2. Call Schwab trading API
      // 3. Handle order placement and confirmation
      
      console.log(`[LIVE TRADE] Attempting to execute: ${action} ${quantity} ${symbol} @ $${price}`);
      
      // For now, we'll simulate it
      tradeResult = {
        success: true,
        orderId: `LIVE-${Date.now()}`,
        executedPrice: price,
        message: "Trade order submitted (requires Schwab API integration)",
      };
    }

    // Log the trade
    const { error: logError } = await supabase
      .from("auto_trades_log")
      .insert({
        user_id: userId,
        symbol,
        action,
        quantity,
        price: tradeResult.executedPrice,
        reasoning: tradeResult.message,
        status: tradeResult.success ? "executed" : "failed",
      });

    if (logError) {
      console.error("Error logging trade:", logError);
    }

    return new Response(
      JSON.stringify({
        success: tradeResult.success,
        orderId: tradeResult.orderId,
        executedPrice: tradeResult.executedPrice,
        message: tradeResult.message,
        pdtWarning: pdtWarning || undefined,
        isPaperTrading
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error executing trade:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});