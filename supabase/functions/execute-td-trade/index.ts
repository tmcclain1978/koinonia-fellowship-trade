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

    const { data: { user } } = await supabaseClient.auth.getUser((req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, ''));
    if (!user) throw new Error('Not authenticated');

    const { symbol, action, quantity, orderType = 'MARKET' } = await req.json();

    console.log('TD Ameritrade trade execution:', { symbol, action, quantity, orderType });

    // Get user's TD Ameritrade credentials
    const { data: credentials, error: credsError } = await supabaseClient
      .from('user_api_credentials')
      .select('td_client_id, td_refresh_token')
      .eq('user_id', user.id)
      .eq('broker_type', 'td_ameritrade')
      .single();

    if (credsError || !credentials) {
      throw new Error('TD Ameritrade credentials not found');
    }

    const tdClientId = await safeDecrypt(credentials.td_client_id) as string;
    const tdRefreshToken = await safeDecrypt(credentials.td_refresh_token) as string;

    // Get access token using refresh token
    const tokenResponse = await fetch('https://api.tdameritrade.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tdRefreshToken,
        client_id: tdClientId,
      }),
    });

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Execute trade
    const orderPayload = {
      orderType: orderType,
      session: 'NORMAL',
      duration: 'DAY',
      orderStrategyType: 'SINGLE',
      orderLegCollection: [
        {
          instruction: action === 'buy' ? 'BUY' : 'SELL',
          quantity: quantity,
          instrument: {
            symbol: symbol,
            assetType: 'EQUITY',
          },
        },
      ],
    };

    const orderResponse = await fetch(
      `https://api.tdameritrade.com/v1/accounts/${tdClientId}/orders`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderPayload),
      }
    );

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      console.error('TD Ameritrade order error:', errorText);
      throw new Error(`Failed to place order: ${errorText}`);
    }

    const orderId = orderResponse.headers.get('location')?.split('/').pop();

    console.log('TD Ameritrade order placed successfully:', orderId);

    return new Response(
      JSON.stringify({
        success: true,
        orderId,
        broker: 'td_ameritrade',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error executing TD Ameritrade trade:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});