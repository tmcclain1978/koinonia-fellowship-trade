import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Decryption helper
async function getEncryptionKey(): Promise<CryptoKey> {
  const ENCRYPTION_KEY_B64 = Deno.env.get("CREDENTIALS_ENCRYPTION_KEY");
  let keyData: Uint8Array;
  
  if (!ENCRYPTION_KEY_B64) {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const encoder = new TextEncoder();
    const data = encoder.encode(serviceKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    keyData = new Uint8Array(hashBuffer);
  } else {
    try {
      keyData = Uint8Array.from(atob(ENCRYPTION_KEY_B64), c => c.charCodeAt(0));
      if (keyData.length !== 32) {
        throw new Error("Invalid key length");
      }
    } catch (error) {
      const encoder = new TextEncoder();
      const data = encoder.encode(ENCRYPTION_KEY_B64);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      keyData = new Uint8Array(hashBuffer);
    }
  }
  
  return await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function decryptText(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}

async function encryptText(text: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(text)
  );
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

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

    // Get user's Schwab credentials
    const { data, error: dbError } = await supabase
      .from('user_api_credentials')
      .select('schwab_client_id, schwab_client_secret, schwab_refresh_token, schwab_access_token, schwab_token_expires_at')
      .eq('user_id', user.id)
      .single();

    if (dbError || !data) {
      throw new Error('No Schwab credentials found');
    }

    // Decrypt credentials
    let clientId = data.schwab_client_id;
    let clientSecret = data.schwab_client_secret;
    let refreshToken = data.schwab_refresh_token;
    let cachedAccessToken = data.schwab_access_token;
    let tokenExpiresAt = data.schwab_token_expires_at;
    
    try {
      if (clientId) clientId = await decryptText(clientId);
      if (clientSecret) clientSecret = await decryptText(clientSecret);
      if (refreshToken) refreshToken = await decryptText(refreshToken);
      if (cachedAccessToken) cachedAccessToken = await decryptText(cachedAccessToken);
    } catch (decryptError) {
      console.error('Decryption failed, using plain text:', decryptError);
    }

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Missing Schwab credentials. Please complete OAuth flow in Settings.');
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
      const error = await tokenResponse.text();
      console.error('[schwab-get-access-token] Token refresh failed:', error);
      throw new Error('Failed to refresh access token. Please re-authenticate in Settings.');
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
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
