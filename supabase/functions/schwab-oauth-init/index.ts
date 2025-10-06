import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Build Schwab OAuth URL
    const redirectUri = `${supabaseUrl}/functions/v1/schwab-oauth-callback`;
    const state = user.id; // Use user ID as state for verification
    
    const authUrl = new URL('https://api.schwabapi.com/v1/oauth/authorize');
    authUrl.searchParams.set('client_id', credentials.schwab_client_id);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', 'AccountsTrading OptionChains');

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
