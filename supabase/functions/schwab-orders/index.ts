import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAudit } from "../_shared/audit.ts";

// IDs go into the Schwab URL path; only allow the characters they actually use.
const ORDER_ID_RE = /^[0-9]{1,20}$/;
const ACCOUNT_HASH_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** Order ID from a Location header like .../accounts/{hash}/orders/{orderId}. */
const orderIdFromLocation = (location: string | null) => {
  const id = (location || '').split('/').filter(Boolean).pop() || '';
  return ORDER_ID_RE.test(id) ? id : undefined;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SCHWAB_API_BASE = 'https://api.schwabapi.com/trader/v1';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, accountHash, orderId, order, fromEnteredTime, toEnteredTime, maxResults, status } = body;

    if (accountHash !== undefined && !ACCOUNT_HASH_RE.test(String(accountHash))) {
      throw new Error('Invalid accountHash');
    }
    if (orderId !== undefined && !ORDER_ID_RE.test(String(orderId))) {
      throw new Error('Invalid orderId');
    }

    // Who is acting (for the audit log of order changes).
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData } = await supabase.auth.getUser(jwt);
    const userId = userData?.user?.id;

    // Get Schwab access token
    const { data: tokenData, error: tokenError } = await supabase.functions.invoke(
      "schwab-get-access-token",
      { headers: { Authorization: authHeader } }
    );

    if (tokenError || !tokenData?.access_token) {
      console.log('[schwab-orders] No access token available, OAuth required');
      return new Response(
        JSON.stringify({ 
          success: false,
          requires_oauth: true,
          message: 'Please complete Schwab OAuth in Settings to place orders.',
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const accessToken = tokenData.access_token;
    console.log(`[schwab-orders] Action: ${action}, Account: ${accountHash || 'all'}`);

    let endpoint: string;
    let method = 'GET';
    let requestBody: string | undefined;
    let result: any;

    switch (action) {
      case 'get_orders':
        // Get orders for a specific account
        if (!accountHash) {
          throw new Error('accountHash is required for get_orders');
        }
        endpoint = `${SCHWAB_API_BASE}/accounts/${accountHash}/orders`;
        const orderParams = new URLSearchParams();
        if (fromEnteredTime) orderParams.append('fromEnteredTime', fromEnteredTime);
        if (toEnteredTime) orderParams.append('toEnteredTime', toEnteredTime);
        if (maxResults) orderParams.append('maxResults', maxResults.toString());
        if (status) orderParams.append('status', status);
        if (orderParams.toString()) {
          endpoint += `?${orderParams.toString()}`;
        }
        break;

      case 'get_orders_all':
        // Get orders for all accounts
        endpoint = `${SCHWAB_API_BASE}/orders`;
        const allOrderParams = new URLSearchParams();
        if (fromEnteredTime) allOrderParams.append('fromEnteredTime', fromEnteredTime);
        if (toEnteredTime) allOrderParams.append('toEnteredTime', toEnteredTime);
        if (maxResults) allOrderParams.append('maxResults', maxResults.toString());
        if (status) allOrderParams.append('status', status);
        if (allOrderParams.toString()) {
          endpoint += `?${allOrderParams.toString()}`;
        }
        break;

      case 'get_order':
        // Get a specific order
        if (!accountHash || !orderId) {
          throw new Error('accountHash and orderId are required for get_order');
        }
        endpoint = `${SCHWAB_API_BASE}/accounts/${accountHash}/orders/${orderId}`;
        break;

      case 'place_order':
        // Place a new order
        if (!accountHash || !order) {
          throw new Error('accountHash and order are required for place_order');
        }
        endpoint = `${SCHWAB_API_BASE}/accounts/${accountHash}/orders`;
        method = 'POST';
        requestBody = JSON.stringify(order);
        console.log('[schwab-orders] Placing order:', requestBody);
        break;

      case 'preview_order':
        // Preview an order (get fees, validation)
        if (!accountHash || !order) {
          throw new Error('accountHash and order are required for preview_order');
        }
        endpoint = `${SCHWAB_API_BASE}/accounts/${accountHash}/previewOrder`;
        method = 'POST';
        requestBody = JSON.stringify(order);
        break;

      case 'cancel_order':
        // Cancel an order
        if (!accountHash || !orderId) {
          throw new Error('accountHash and orderId are required for cancel_order');
        }
        endpoint = `${SCHWAB_API_BASE}/accounts/${accountHash}/orders/${orderId}`;
        method = 'DELETE';
        break;

      case 'replace_order':
        // Replace an existing order
        if (!accountHash || !orderId || !order) {
          throw new Error('accountHash, orderId, and order are required for replace_order');
        }
        endpoint = `${SCHWAB_API_BASE}/accounts/${accountHash}/orders/${orderId}`;
        method = 'PUT';
        requestBody = JSON.stringify(order);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`[schwab-orders] ${method} ${endpoint}`);

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };

    if (requestBody) {
      fetchOptions.body = requestBody;
    }

    const response = await fetch(endpoint, fetchOptions);

    // Handle different response types. Schwab answers place and replace with
    // 201 Created, an EMPTY body and the new order's URL in the Location header
    // (a replace cancels the old order and creates a new one with a new ID).
    // Reading that empty body as JSON used to throw, so a successful replace
    // was reported as a failure.
    const mutating = action === 'place_order' || action === 'replace_order' || action === 'cancel_order';
    if (mutating) {
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[schwab-orders] ${action} error ${response.status}:`, errorText);
        if (userId) {
          await logAudit({
            userId,
            action: `schwab_${action}_failed`,
            resourceType: 'schwab_order',
            resourceId: orderId,
            details: { accountHash, status: response.status, error: errorText.slice(0, 500), order },
          });
        }
        if (response.status === 401) throw new Error('Access token expired. Please re-authenticate in Settings.');
        const verb = action === 'place_order' ? 'place' : action === 'replace_order' ? 'replace' : 'cancel';
        throw new Error(`Failed to ${verb} order: ${errorText}`);
      }
      const newOrderId = action === 'cancel_order' ? undefined : orderIdFromLocation(response.headers.get('location'));
      result =
        action === 'place_order'
          ? { success: true, orderId: newOrderId, message: 'Order placed successfully' }
          : action === 'replace_order'
            ? { success: true, orderId: newOrderId, replacedOrderId: orderId, message: 'Order replaced successfully' }
            : { success: true, message: 'Order cancelled successfully' };
      if (userId) {
        await logAudit({
          userId,
          action: `schwab_${action}`,
          resourceType: 'schwab_order',
          resourceId: newOrderId ?? orderId,
          details: { accountHash, previousOrderId: action === 'replace_order' ? orderId : undefined, order },
        });
      }
    } else {
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[schwab-orders] API Error ${response.status}:`, errorText);
        
        if (response.status === 401) {
          throw new Error('Access token expired. Please re-authenticate in Settings.');
        }
        
        throw new Error(`Schwab API error (${response.status}): ${errorText}`);
      }
      const text = await response.text();
      result = text ? JSON.parse(text) : null;
    }

    console.log(`[schwab-orders] Success for action: ${action}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        data: result,
        action,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[schwab-orders] Error:', error);
    return new Response(
      JSON.stringify({ error: (error as any).message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
