import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Decryption helper (same as encrypt-credentials)
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

serve(async (req) => {
  console.log('[schwab-oauth-callback] Request received:', req.method, req.url);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    console.log('[schwab-oauth-callback] Params:', { 
      hasCode: !!code, 
      hasState: !!state, 
      error, 
      errorDescription 
    });

    // Check if Schwab returned an error
    if (error) {
      console.error('[schwab-oauth-callback] Schwab returned error:', error, errorDescription);
      throw new Error(`Schwab OAuth error: ${error} - ${errorDescription || 'Unknown error'}`);
    }

    if (!code || !state) {
      throw new Error('Missing authorization code or state');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse the state parameter (contains user ID and return URL)
    let userId: string;
    let returnUrl: string;
    try {
      const stateData = JSON.parse(state);
      userId = stateData.userId;
      returnUrl = stateData.returnUrl || '';
    } catch {
      // Fallback for old format (just user ID)
      userId = state;
      returnUrl = '';
    }

    // Get user's Schwab credentials
    const { data, error: dbError } = await supabase
      .from('user_api_credentials')
      .select('schwab_client_id, schwab_client_secret')
      .eq('user_id', userId)
      .single();

    if (dbError || !data) {
      console.error('Failed to load credentials:', dbError);
      throw new Error('No Schwab credentials found');
    }

    // Decrypt credentials
    let clientId = data.schwab_client_id;
    let clientSecret = data.schwab_client_secret;
    
    console.log('Retrieved credentials - Client ID length:', clientId?.length, 'Secret length:', clientSecret?.length);
    
    try {
      if (clientId) {
        clientId = await decryptText(clientId);
        console.log('Decrypted Client ID length:', clientId.length);
      }
      if (clientSecret) {
        clientSecret = await decryptText(clientSecret);
        console.log('Decrypted Client Secret length:', clientSecret.length);
      }
    } catch (decryptError) {
      console.error('Decryption failed, using plain text:', decryptError);
      // Restore original values if decryption fails
      clientId = data.schwab_client_id;
      clientSecret = data.schwab_client_secret;
      console.log('Using plain text - Client ID length:', clientId?.length, 'Secret length:', clientSecret?.length);
    }

    if (!clientId || !clientSecret) {
      console.error('Missing credentials after decryption attempt');
      throw new Error('Missing Schwab credentials');
    }

    console.log('About to exchange code with Schwab using Client ID:', clientId.substring(0, 10) + '...');

    // Exchange authorization code for tokens
    const tokenUrl = 'https://api.schwabapi.com/v1/oauth/token';
    const redirectUri = `${supabaseUrl}/functions/v1/schwab-oauth-callback`;
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Token exchange failed. Status:', tokenResponse.status);
      console.error('Response:', error);
      console.error('Using redirect URI:', redirectUri);
      throw new Error(`Schwab API error (${tokenResponse.status}): ${error}`);
    }

    const tokens = await tokenResponse.json();

    // Store the refresh token
    const { error: updateError } = await supabase
      .from('user_api_credentials')
      .update({
        schwab_refresh_token: tokens.refresh_token,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Failed to store refresh token:', updateError);
      throw new Error('Failed to store refresh token');
    }

    // Redirect back to settings page with success
    const redirectUrl = returnUrl ? `${returnUrl}/settings?oauth=success` : '/settings?oauth=success';
    
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': redirectUrl,
      },
    });

  } catch (error) {
    console.error('Error in schwab-oauth-callback:', error);
    
    // Try to get returnUrl from state if available
    const url = new URL(req.url);
    const state = url.searchParams.get('state');
    let returnUrl = '';
    try {
      if (state) {
        const stateData = JSON.parse(state);
        returnUrl = stateData.returnUrl || '';
      }
    } catch {}
    
    // Redirect back to settings with error
    const redirectUrl = returnUrl 
      ? `${returnUrl}/settings?oauth=error&message=${encodeURIComponent(error.message)}`
      : `/settings?oauth=error&message=${encodeURIComponent(error.message)}`;
    
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': redirectUrl,
      },
    });
  }
});
