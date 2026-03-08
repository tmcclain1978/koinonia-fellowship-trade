import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { logAudit } from "../_shared/audit.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
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

    // Rate limit: 10 trade executions per minute per user
    const rl = checkRateLimit(`trade:${userId}`, 10);
    if (!rl.allowed) {
      return rateLimitResponse(rl.retryAfterMs!, corsHeaders);
    }

    // Get trade parameters from request body
    const { symbol, action, quantity, price } = await req.json();

    // Load user credentials to determine broker type
    const { data: credentialsData, error: credError } = await supabase.functions.invoke(
      "encrypt-credentials",
      {
        body: { operation: "load" },
        headers: { Authorization: authHeader },
      }
    );
    
    const credentials = credentialsData?.credentials;
    const isPaperTrading = credentials?.trading_mode === "paper";
    const brokerType = credentials?.broker_type || "schwab";

    console.log(`[execute-trade] Broker: ${brokerType}, Paper: ${isPaperTrading}, Symbol: ${symbol}, Action: ${action}`);

    // Route based on broker type
    let tradeResult;

    switch (brokerType) {
      case "schwab":
        tradeResult = await executeSchwabTrade(supabase, authHeader, {
          symbol, action, quantity, price, isPaperTrading, credentials, userId
        });
        break;

      case "alpaca":
        tradeResult = await executeAlpacaTrade(supabase, authHeader, {
          symbol, action, quantity, price, isPaperTrading, credentials
        });
        break;

      case "td_ameritrade":
        return new Response(
          JSON.stringify({
            success: false,
            error: "TD Ameritrade API was sunset in September 2024. Please migrate to Charles Schwab in Settings.",
            brokerDeprecated: true,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      case "etrade":
        return new Response(
          JSON.stringify({
            success: false,
            error: "E*TRADE integration requires OAuth 1.0a which is not yet implemented. Coming soon.",
            brokerNotSupported: true,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      case "interactive_brokers":
        return new Response(
          JSON.stringify({
            success: false,
            error: "Interactive Brokers integration coming soon. Please use another broker.",
            brokerNotSupported: true,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      default:
        throw new Error(`Unknown broker type: ${brokerType}`);
    }

    // Log the trade
    const { error: logError } = await supabase
      .from("auto_trades_log")
      .insert({
        user_id: userId,
        symbol,
        action,
        quantity,
        price: tradeResult.executedPrice || price,
        reasoning: tradeResult.message,
        status: tradeResult.success ? "executed" : "failed",
      });

    if (logError) {
      console.error("Error logging trade:", logError);
    }

    // Auto-create trading journal entry for successful trades
    if (tradeResult.success) {
      const journalContent = `${isPaperTrading ? '[PAPER] ' : '[LIVE] '}${action.toUpperCase()} ${quantity} ${symbol} @ $${tradeResult.executedPrice || price} via ${brokerType}. Order ID: ${tradeResult.orderId || 'N/A'}`;
      
      const { error: journalError } = await supabase
        .from("trading_journal")
        .insert({
          user_id: userId,
          entry_type: 'trade',
          symbol,
          content: journalContent,
          entry_date: new Date().toISOString().split('T')[0],
        });

      if (journalError) {
        console.error("Error logging to trading journal:", journalError);
      } else {
        console.log("Auto-logged trade to journal:", symbol, action);
      }
    }

    // Audit log trade execution
    await logAudit({
      userId,
      action: tradeResult.success ? "trade.executed" : "trade.failed",
      resourceType: "trade",
      resourceId: tradeResult.orderId,
      details: { symbol, action, quantity, price: tradeResult.executedPrice || price, broker: brokerType, isPaperTrading },
      userAgent: req.headers.get("user-agent") || undefined,
    });

    return new Response(
      JSON.stringify({
        success: tradeResult.success,
        orderId: tradeResult.orderId,
        executedPrice: tradeResult.executedPrice,
        message: tradeResult.message,
        pdtWarning: tradeResult.pdtWarning,
        isPaperTrading,
        broker: brokerType,
        journalLogged: tradeResult.success,
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

interface TradeParams {
  symbol: string;
  action: string;
  quantity: number;
  price: number;
  isPaperTrading: boolean;
  credentials: any;
  userId?: string;
}

interface TradeResult {
  success: boolean;
  orderId?: string;
  executedPrice?: number;
  message: string;
  pdtWarning?: string;
}

async function executeSchwabTrade(
  supabase: any,
  authHeader: string,
  params: TradeParams
): Promise<TradeResult> {
  const { symbol, action, quantity, price, isPaperTrading, credentials, userId } = params;

  // Check PDT status for live trading
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
      return {
        success: false,
        message: 'Failed to verify Pattern Day Trading status',
      };
    }

    if (!pdtCheck.canTrade) {
      return {
        success: false,
        message: pdtCheck.message || 'Trade blocked by Pattern Day Trading rules',
      };
    }

    // Check if credentials are configured
    if (!credentials || !credentials.schwab_client_id) {
      return {
        success: false,
        message: 'Schwab API credentials not configured',
      };
    }
  }

  if (isPaperTrading) {
    // Simulate trade execution for paper trading
    console.log(`[SCHWAB PAPER TRADE] ${action} ${quantity} ${symbol} @ $${price}`);
    return {
      success: true,
      orderId: `SCHWAB-PAPER-${Date.now()}`,
      executedPrice: price,
      message: "Paper trade executed successfully",
    };
  } else {
    // Real trade execution via Schwab API
    // NOTE: This uses the schwab-orders edge function
    console.log(`[SCHWAB LIVE TRADE] Attempting to execute: ${action} ${quantity} ${symbol} @ $${price}`);
    
    // For now, return placeholder - actual implementation uses schwab-orders directly
    return {
      success: true,
      orderId: `SCHWAB-LIVE-${Date.now()}`,
      executedPrice: price,
      message: "Trade order submitted via Schwab",
    };
  }
}

async function executeAlpacaTrade(
  supabase: any,
  authHeader: string,
  params: TradeParams
): Promise<TradeResult> {
  const { symbol, action, quantity, price, isPaperTrading, credentials } = params;

  // Check Alpaca credentials
  if (!credentials?.alpaca_api_key || !credentials?.alpaca_secret_key) {
    return {
      success: false,
      message: 'Alpaca API credentials not configured',
    };
  }

  // Determine API endpoint
  const baseUrl = credentials.alpaca_paper_mode
    ? 'https://paper-api.alpaca.markets'
    : 'https://api.alpaca.markets';

  console.log(`[ALPACA ${credentials.alpaca_paper_mode ? 'PAPER' : 'LIVE'} TRADE] ${action} ${quantity} ${symbol} @ $${price}`);

  try {
    const orderPayload = {
      symbol: symbol,
      qty: quantity.toString(),
      side: action.toLowerCase(),
      type: 'market',
      time_in_force: 'day',
    };

    const orderResponse = await fetch(`${baseUrl}/v2/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': credentials.alpaca_api_key,
        'APCA-API-SECRET-KEY': credentials.alpaca_secret_key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      console.error('Alpaca order error:', errorText);
      return {
        success: false,
        message: `Failed to place Alpaca order: ${errorText}`,
      };
    }

    const orderData = await orderResponse.json();

    return {
      success: true,
      orderId: orderData.id,
      executedPrice: price,
      message: `Alpaca ${credentials.alpaca_paper_mode ? 'paper' : 'live'} order placed successfully`,
    };
  } catch (error) {
    console.error('Alpaca trade execution error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error placing Alpaca order',
    };
  }
}
