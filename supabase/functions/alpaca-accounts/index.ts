import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    // Get user's Alpaca credentials
    const { data: credentials, error: credError } = await supabase
      .from('user_api_credentials')
      .select('alpaca_api_key, alpaca_secret_key, alpaca_paper_mode')
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials) {
      throw new Error('Alpaca credentials not found. Please configure them in Settings.');
    }

    if (!credentials.alpaca_api_key || !credentials.alpaca_secret_key) {
      throw new Error('Alpaca API key and secret are required');
    }

    // Determine API endpoint based on paper/live mode
    const baseUrl = credentials.alpaca_paper_mode
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';

    const { action, symbol, cancel_orders } = await req.json();

    const headers = {
      'APCA-API-KEY-ID': credentials.alpaca_api_key,
      'APCA-API-SECRET-KEY': credentials.alpaca_secret_key,
      'Content-Type': 'application/json',
    };

    let response: Response;

    switch (action) {
      case 'account':
        console.log('Fetching Alpaca account details...');
        response = await fetch(`${baseUrl}/v2/account`, { headers });
        break;

      case 'positions':
        console.log('Fetching Alpaca positions...');
        response = await fetch(`${baseUrl}/v2/positions`, { headers });
        break;

      case 'position':
        if (!symbol) {
          throw new Error('Symbol required for position lookup');
        }
        console.log(`Fetching position for ${symbol}...`);
        response = await fetch(`${baseUrl}/v2/positions/${symbol}`, { headers });
        break;

      case 'close_all':
        console.log('Closing all positions...');
        const closeUrl = `${baseUrl}/v2/positions${cancel_orders ? '?cancel_orders=true' : ''}`;
        response = await fetch(closeUrl, { 
          method: 'DELETE',
          headers,
        });
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Alpaca API error (${response.status}):`, errorText);
      throw new Error(`Alpaca API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({ 
        data,
        paperMode: credentials.alpaca_paper_mode,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in alpaca-accounts:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
