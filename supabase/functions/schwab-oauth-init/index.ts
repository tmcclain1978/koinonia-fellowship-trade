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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header to identify the user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from JWT
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    // Get the origin from the request to use for redirect after OAuth
    const referer = req.headers.get('referer') || req.headers.get('origin');
    const appOrigin = referer ? new URL(referer).origin : '';

    // Get user's Schwab client ID
    const { data: credentials } = await supabase
      .from('user_api_credentials')
      .select('schwab_client_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!credentials?.schwab_client_id) {
      throw new Error('Schwab Client ID not configured. Please add it in Settings first.');
    }

    // Decrypt the client ID
    let clientId = credentials.schwab_client_id;
    try {
      clientId = await decryptText(clientId);
    } catch (decryptError) {
      console.error('Decryption failed, using plain text:', decryptError);
      // If decryption fails, assume plain text (for backward compatibility)
    }

    clientId = clientId.trim();

    // Build Schwab OAuth URL
    // Note: The callback URL must be registered in your Schwab Developer Portal app
    const redirectUri = `${supabaseUrl}/functions/v1/schwab-oauth-callback`;

    // The state parameter MUST be URL-safe; Schwab can reject JSON-looking state.
    // We'll base64url-encode the JSON payload.
    const statePayload = JSON.stringify({
      userId: user.id,
      returnUrl: appOrigin,
    });

    const toBase64Url = (input: string) => {
      const b64 = btoa(input);
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    };

    const state = toBase64Url(statePayload);

    console.log('Building OAuth URL with:', {
      clientId: clientId.substring(0, 10) + '...', // Log partial for debugging
      redirectUri,
      state: state.substring(0, 16) + '...',
      appOrigin,
    });

    // Build the auth URL - use the standard OAuth endpoint
    // Schwab OAuth doesn't require scope parameter
    const authUrl = new URL('https://api.schwabapi.com/v1/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);

    console.log('Generated auth URL:', authUrl.toString());

    return new Response(
      JSON.stringify({ 
        authUrl: authUrl.toString(),
        message: 'Redirect user to this URL to complete OAuth flow'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in schwab-oauth-init:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
