import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { safeDecrypt } from "../_shared/encryption.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { pair, direction, amount, duration } = await req.json();

    // Get user credentials
    const { data: credentials, error: credError } = await supabaseClient
      .from('user_api_credentials')
      .select('pocketoption_api_key, pocketoption_ssid')
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials?.pocketoption_api_key) {
      throw new Error("PocketOption credentials not found");
    }

    const apiKey = await safeDecrypt(credentials.pocketoption_api_key) as string;
    const ssid = await safeDecrypt(credentials.pocketoption_ssid) as string;

    // Execute trade via PocketOption API
    // Note: Replace with actual PocketOption trading endpoint
    const tradeResponse = await fetch("https://api.po.trade/api/v2/trade", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "X-SSID": ssid,
      },
      body: JSON.stringify({
        asset: pair,
        action: direction === "up" ? "call" : "put",
        amount: amount,
        time: duration,
      }),
    });

    if (!tradeResponse.ok) {
      throw new Error(`Trade execution failed: ${tradeResponse.statusText}`);
    }

    const tradeData = await tradeResponse.json();
    
    // Log trade in database
    const { error: logError } = await supabaseClient
      .from('pocketoption_trades')
      .insert({
        user_id: user.id,
        pair,
        direction,
        amount,
        duration,
        entry_price: tradeData.entry_price || 0,
        status: 'open',
      });

    if (logError) {
      console.error("Error logging trade:", logError);
    }

    console.log(`Trade executed for ${user.id}: ${direction} ${pair}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        trade_id: tradeData.id,
        message: "Trade executed successfully" 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error("Trade execution error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: (error as any).message || "Trade execution failed" 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
