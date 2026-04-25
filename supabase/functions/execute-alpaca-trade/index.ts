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
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { symbol, action, quantity, orderType = 'market' } = await req.json();

    console.log('Alpaca trade execution:', { symbol, action, quantity, orderType });

    // Get user's Alpaca credentials
    const { data: credentials, error: credsError } = await supabaseClient
      .from('user_api_credentials')
      .select('alpaca_api_key, alpaca_secret_key, alpaca_paper_mode')
      .eq('user_id', user.id)
      .eq('broker_type', 'alpaca')
      .single();

    if (credsError || !credentials) {
      throw new Error('Alpaca credentials not found');
    }

    const apiKey = await safeDecrypt(credentials.alpaca_api_key) as string;
    const secretKey = await safeDecrypt(credentials.alpaca_secret_key) as string;

    // Determine API endpoint based on paper/live mode
    const baseUrl = credentials.alpaca_paper_mode
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';

    // Place order
    const orderPayload = {
      symbol: symbol,
      qty: quantity,
      side: action.toLowerCase(),
      type: orderType.toLowerCase(),
      time_in_force: 'day',
    };

    const orderResponse = await fetch(`${baseUrl}/v2/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      console.error('Alpaca order error:', errorText);
      throw new Error(`Failed to place order: ${errorText}`);
    }

    const orderData = await orderResponse.json();

    console.log('Alpaca order placed successfully:', orderData.id);

    // Auto-create trading journal entry
    const journalContent = `${credentials.alpaca_paper_mode ? '[PAPER] ' : '[LIVE] '}${action.toUpperCase()} ${quantity} ${symbol} via Alpaca. Order ID: ${orderData.id}. Status: ${orderData.status}`;
    
    const { error: journalError } = await supabaseClient
      .from('trading_journal')
      .insert({
        user_id: user.id,
        entry_type: 'trade',
        symbol,
        content: journalContent,
        entry_date: new Date().toISOString().split('T')[0],
      });

    if (journalError) {
      console.error('Error logging to trading journal:', journalError);
    } else {
      console.log('Auto-logged Alpaca trade to journal:', symbol, action);
    }

    return new Response(
      JSON.stringify({
        success: true,
        orderId: orderData.id,
        status: orderData.status,
        broker: 'alpaca',
        paperMode: credentials.alpaca_paper_mode,
        journalLogged: !journalError,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error executing Alpaca trade:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});