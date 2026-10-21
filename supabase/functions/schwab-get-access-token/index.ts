import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptText, safeDecrypt } from "../_shared/encryption.ts";
import { logAudit } from "../_shared/audit.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Prevent hammering Schwab token endpoint when refresh token is invalid
const REFRESH_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const lastRefreshFailureByUser = new Map<string, number>();

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

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    // Rate limit: 20 token requests per minute per user
    const rl = checkRateLimit(`schwab-token:${user.id}`, 20);
    if (!rl.allowed) {
      return rateLimitResponse(rl.retryAfterMs!, corsHeaders);
    }

    // Get user's Schwab credentials
    const { data, error: dbError } = await supabase
      .from('user_api_credentials')
      .select('schwab_client_id, schwab_client_secret, schwab_refresh_token, schwab_access_token, schwab_token_expires_at')
      .eq('user_id', user.id)
      .single();

    if (dbError || !data) {
      throw new Error('No Schwab credentials found');
    }

    // Decrypt credentials (robust: per-field fallback to plain text)
    let clientId = data.schwab_client_id;
    let clientSecret = data.schwab_client_secret;
    let refreshToken = data.schwab_refresh_token;
    let cachedAccessToken = data.schwab_access_token;
    let tokenExpiresAt = data.schwab_token_expires_at;

    // Using imported safeDecrypt from shared encryption module

    clientId = await safeDecrypt(clientId);
    clientSecret = await safeDecrypt(clientSecret);
    refreshToken = await safeDecrypt(refreshToken);
    cachedAccessToken = await safeDecrypt(cachedAccessToken);

    if (!clientId || !clientSecret || !refreshToken) {
      return new Response(
        JSON.stringify({
          requiresOAuth: true,
          error: 'Missing Schwab credentials. Please complete OAuth flow in Settings.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // If we recently failed to refresh for this user, don't keep retrying
    const lastFail = lastRefreshFailureByUser.get(user.id);
    if (lastFail && Date.now() - lastFail < REFRESH_FAILURE_COOLDOWN_MS) {
      return new Response(
        JSON.stringify({
          requiresOAuth: true,
          error: 'Schwab token refresh recently failed. Please re-authenticate in Settings.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if we have a valid cached access token (with 5 min buffer)
    const now = new Date();
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes in ms
    
    if (cachedAccessToken && tokenExpiresAt) {
      const expiresAt = new Date(tokenExpiresAt);
      if (expiresAt.getTime() - expiryBuffer > now.getTime()) {
        console.log('[schwab-get-access-token] Using cached access token, expires:', expiresAt.toISOString());
        return new Response(
          JSON.stringify({ 
            access_token: cachedAccessToken,
            expires_in: Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
            cached: true,
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
      console.log('[schwab-get-access-token] Cached token expired or expiring soon, refreshing...');
    }

    // Exchange refresh token for access token
    const tokenUrl = 'https://api.schwabapi.com/v1/oauth/token';
    
    console.log('[schwab-get-access-token] Refreshing access token...');
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[schwab-get-access-token] Token refresh failed:', errorText);

      // Remember the failure briefly so we don't spam Schwab with refresh attempts
      lastRefreshFailureByUser.set(user.id, Date.now());

      return new Response(
        JSON.stringify({
          requiresOAuth: true,
          error: 'Failed to refresh access token. Please re-authenticate in Settings.',
          details: errorText,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const tokens = await tokenResponse.json();
    console.log('[schwab-get-access-token] Token refresh successful, expires_in:', tokens.expires_in);

    // Calculate expiry time
    const expiresAt = new Date(now.getTime() + (tokens.expires_in * 1000));
    
    // Encrypt and cache the new access token
    const encryptedAccessToken = await encryptText(tokens.access_token);
    
    // If we got a new refresh token, store it too (Schwab rotates refresh tokens)
    const updateData: any = {
      schwab_access_token: encryptedAccessToken,
      schwab_token_expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    };
    
    if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
      console.log('[schwab-get-access-token] New refresh token received, storing...');
      updateData.schwab_refresh_token = await encryptText(tokens.refresh_token);
      updateData.schwab_refresh_issued_at = now.toISOString();
    }
    
    const { error: updateError } = await supabase
      .from('user_api_credentials')
      .update(updateData)
      .eq('user_id', user.id);
    
    if (updateError) {
      console.error('[schwab-get-access-token] Failed to cache token:', updateError);
      // Don't throw - we still have a valid token to return
    }

    return new Response(
      JSON.stringify({ 
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
        cached: false,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[schwab-get-access-token] Error:', error);
    return new Response(
      JSON.stringify({ error: (error as any).message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
