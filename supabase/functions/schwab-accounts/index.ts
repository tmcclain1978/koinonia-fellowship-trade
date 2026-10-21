import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Parse request body for action type
    const { action, accountHash, fields } = await req.json();

    // Get Schwab access token
    const { data: tokenData, error: tokenError } = await supabase.functions.invoke(
      "schwab-get-access-token",
      { headers: { Authorization: authHeader } }
    );

    if (tokenError || !tokenData?.access_token) {
      console.log('[schwab-accounts] No access token available, OAuth required');
      return new Response(
        JSON.stringify({ 
          success: false,
          requires_oauth: true,
          message: 'Please complete Schwab OAuth in Settings to access account data.',
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const accessToken = tokenData.access_token;
    console.log(`[schwab-accounts] Action: ${action}, Account: ${accountHash || 'all'}`);

    let endpoint: string;
    let result: any;

    switch (action) {
      case 'linked_accounts':
        // Get all linked accounts with their hashes
        endpoint = `${SCHWAB_API_BASE}/accounts/accountNumbers`;
        break;

      case 'account_details':
        // Get details for a specific account
        if (!accountHash) {
          throw new Error('accountHash is required for account_details');
        }
        endpoint = `${SCHWAB_API_BASE}/accounts/${accountHash}`;
        if (fields) {
          endpoint += `?fields=${fields}`;
        }
        break;

      case 'account_details_all':
        // Get details for all accounts
        endpoint = `${SCHWAB_API_BASE}/accounts`;
        if (fields) {
          endpoint += `?fields=${fields}`;
        }
        break;

      case 'preferences':
        // Get user preferences including streaming info
        endpoint = `${SCHWAB_API_BASE}/userPreference`;
        break;

      case 'transactions':
        const { startDate, endDate, types, symbol } = await req.json();
        if (!accountHash) {
          throw new Error('accountHash is required for transactions');
        }
        endpoint = `${SCHWAB_API_BASE}/accounts/${accountHash}/transactions`;
        const txParams = new URLSearchParams();
        if (startDate) txParams.append('startDate', startDate);
        if (endDate) txParams.append('endDate', endDate);
        if (types) txParams.append('types', Array.isArray(types) ? types.join(',') : types);
        if (symbol) txParams.append('symbol', symbol);
        if (txParams.toString()) {
          endpoint += `?${txParams.toString()}`;
        }
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`[schwab-accounts] Calling: ${endpoint}`);

    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[schwab-accounts] API Error ${response.status}:`, errorText);
      
      // Handle token expiry
      if (response.status === 401) {
        throw new Error('Access token expired. Please re-authenticate in Settings.');
      }
      
      throw new Error(`Schwab API error (${response.status}): ${errorText}`);
    }

    result = await response.json();
    console.log(`[schwab-accounts] Success for action: ${action}`);

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
    console.error('[schwab-accounts] Error:', error);
    return new Response(
      JSON.stringify({ error: (error as any).message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
