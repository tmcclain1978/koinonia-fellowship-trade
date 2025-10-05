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
    const { symbol } = await req.json();

    if (!symbol) {
      throw new Error('Symbol is required');
    }

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

    // Fetch user's Schwab credentials (decrypt using the encrypt-credentials function)
    const { data: credentialsData, error: credError } = await supabase.functions.invoke(
      "encrypt-credentials",
      {
        body: { operation: "load" },
        headers: { Authorization: `Bearer ${authHeader}` },
      }
    );
    
    const credentials = credentialsData?.credentials;

    if (credError || !credentials) {
      return new Response(
        JSON.stringify({ 
          error: 'No Schwab credentials found. Please configure your API credentials in Settings.' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!credentials.schwab_client_id || !credentials.schwab_client_secret) {
      return new Response(
        JSON.stringify({ 
          error: 'Schwab credentials incomplete. Please update your settings.' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // TODO: Implement Schwab OAuth flow and API call
    // This will require:
    // 1. Getting an access token using the refresh token
    // 2. Calling Schwab's options chain API
    // 3. Transforming the response to match the expected format

    // For now, return a message indicating OAuth setup is needed
    return new Response(
      JSON.stringify({ 
        error: 'Schwab OAuth implementation in progress. You need to complete the OAuth flow first.',
        credentials_configured: true
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-schwab-options:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});