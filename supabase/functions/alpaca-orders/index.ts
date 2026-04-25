import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
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

    const apiKey = await safeDecrypt(credentials.alpaca_api_key) as string;
    const secretKey = await safeDecrypt(credentials.alpaca_secret_key) as string;

    // Determine API endpoint based on paper/live mode
    const baseUrl = credentials.alpaca_paper_mode
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';

    const { action, order, orderId, updates, status, limit, after, until, direction } = await req.json();

    const headers = {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': secretKey,
      'Content-Type': 'application/json',
    };

    let response: Response;

    switch (action) {
      case 'list':
        console.log('Listing Alpaca orders...');
        let listUrl = `${baseUrl}/v2/orders?`;
        if (status) listUrl += `status=${status}&`;
        if (limit) listUrl += `limit=${limit}&`;
        if (after) listUrl += `after=${after}&`;
        if (until) listUrl += `until=${until}&`;
        if (direction) listUrl += `direction=${direction}&`;
        
        response = await fetch(listUrl, { headers });
        break;

      case 'get':
        if (!orderId) {
          throw new Error('Order ID required');
        }
        console.log(`Getting order ${orderId}...`);
        response = await fetch(`${baseUrl}/v2/orders/${orderId}`, { headers });
        break;

      case 'place':
        if (!order) {
          throw new Error('Order details required');
        }
        console.log('Placing Alpaca order:', JSON.stringify(order));
        response = await fetch(`${baseUrl}/v2/orders`, {
          method: 'POST',
          headers,
          body: JSON.stringify(order),
        });
        break;

      case 'cancel':
        if (!orderId) {
          throw new Error('Order ID required');
        }
        console.log(`Canceling order ${orderId}...`);
        response = await fetch(`${baseUrl}/v2/orders/${orderId}`, {
          method: 'DELETE',
          headers,
        });
        
        // DELETE returns 204 No Content on success
        if (response.status === 204) {
          return new Response(
            JSON.stringify({ 
              data: { success: true },
              paperMode: credentials.alpaca_paper_mode,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        break;

      case 'cancel_all':
        console.log('Canceling all orders...');
        response = await fetch(`${baseUrl}/v2/orders`, {
          method: 'DELETE',
          headers,
        });
        break;

      case 'replace':
        if (!orderId || !updates) {
          throw new Error('Order ID and updates required');
        }
        console.log(`Replacing order ${orderId}:`, JSON.stringify(updates));
        response = await fetch(`${baseUrl}/v2/orders/${orderId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(updates),
        });
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Alpaca API error (${response.status}):`, errorText);
      
      // Parse error for better messages
      let errorMessage = `Alpaca API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorMessage;
      } catch {
        errorMessage += ` - ${errorText}`;
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();

    // Log trade to auto_trades_log if this was an order placement
    if (action === 'place' && data.id) {
      try {
        await supabase.from('auto_trades_log').insert({
          user_id: user.id,
          symbol: order.symbol,
          action: order.side,
          quantity: parseInt(order.qty) || 0,
          price: parseFloat(order.limit_price || order.stop_price || '0'),
          status: data.status,
          reasoning: `Alpaca ${credentials.alpaca_paper_mode ? 'paper' : 'live'} order`,
        });
      } catch (logError) {
        console.error('Failed to log trade:', logError);
      }
    }

    return new Response(
      JSON.stringify({ 
        data,
        paperMode: credentials.alpaca_paper_mode,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in alpaca-orders:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
