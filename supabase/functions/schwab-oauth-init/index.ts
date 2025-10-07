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

    // Get user's Schwab client ID
    const { data: credentials } = await supabase
      .from('user_api_credentials')
      .select('schwab_client_id')
      .eq('user_id', user.id)
      .single();

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

    // Build Schwab OAuth URL
    // Note: The callback URL must be registered in your Schwab Developer Portal app
    const redirectUri = `${supabaseUrl}/functions/v1/schwab-oauth-callback`;
    const state = user.id; // Use user ID as state for verification
    
    console.log('Building OAuth URL with:', {
      clientId: clientId.substring(0, 10) + '...', // Log partial for debugging
      redirectUri,
      state
    });
    
    // Build the initial auth URL
    const authUrl = new URL('https://api.schwabapi.com/v1/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);

    console.log('Initial auth URL:', authUrl.toString());

    // Make a GET request to follow Schwab's redirect chain
    // This is required because Schwab redirects to their login gateway
    try {
      const response = await fetch(authUrl.toString(), {
        method: 'GET',
        redirect: 'manual' // Don't automatically follow redirects
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      // Get the Location header which contains the actual auth URL
      const actualAuthUrl = response.headers.get('location') || authUrl.toString();
      
      console.log('Actual auth URL from Schwab:', actualAuthUrl);

      return new Response(
        JSON.stringify({ 
          authUrl: actualAuthUrl,
          message: 'Redirect user to this URL to complete OAuth flow'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } catch (fetchError) {
      console.error('Error fetching auth URL:', fetchError);
      // Fallback to direct URL if fetch fails
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
    }

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
