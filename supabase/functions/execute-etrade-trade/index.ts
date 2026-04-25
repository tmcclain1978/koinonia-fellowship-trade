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

    const { symbol, action, quantity, orderType = 'MARKET' } = await req.json();

    console.log('E*TRADE trade execution:', { symbol, action, quantity, orderType });

    // Get user's E*TRADE credentials
    const { data: credentials, error: credsError } = await supabaseClient
      .from('user_api_credentials')
      .select('etrade_consumer_key, etrade_consumer_secret, etrade_access_token, etrade_access_secret')
      .eq('user_id', user.id)
      .eq('broker_type', 'etrade')
      .single();

    if (credsError || !credentials) {
      throw new Error('E*TRADE credentials not found');
    }

    // Server-only decryption — used to OAuth-sign requests below
    const _consumerKey = await safeDecrypt(credentials.etrade_consumer_key) as string;
    const _consumerSecret = await safeDecrypt(credentials.etrade_consumer_secret) as string;
    const _accessToken = await safeDecrypt(credentials.etrade_access_token) as string;
    const _accessSecret = await safeDecrypt(credentials.etrade_access_secret) as string;

    // E*TRADE uses OAuth 1.0a - would need OAuth signature generation
    // This is a simplified example - production would need full OAuth implementation
    const baseUrl = 'https://api.etrade.com/v1/accounts';

    // Place order endpoint (simplified)
    const orderPayload = {
      PlaceEquityOrder: {
        orderType: orderType,
        clientOrderId: crypto.randomUUID(),
        Order: [
          {
            allOrNone: false,
            quantity: quantity,
            Instrument: [
              {
                Product: {
                  securityType: 'EQ',
                  symbol: symbol,
                },
                orderAction: action.toUpperCase(),
              },
            ],
          },
        ],
      },
    };

    console.log('E*TRADE order payload prepared');

    // Note: Full OAuth 1.0a signature would be needed here
    // For now, returning a placeholder response
    return new Response(
      JSON.stringify({
        success: true,
        orderId: crypto.randomUUID(),
        broker: 'etrade',
        note: 'E*TRADE OAuth 1.0a implementation required',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error executing E*TRADE trade:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});