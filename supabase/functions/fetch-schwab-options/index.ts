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
    // For now, return mock options data for testing
    const currentDate = new Date();
    const mockExpirations = [
      new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      new Date(currentDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      new Date(currentDate.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    ];

    const mockStrikes = [150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200];
    const mockOptions = [];

    for (const expiration of mockExpirations) {
      for (const strike of mockStrikes) {
        mockOptions.push({
          type: 'CALL',
          strike,
          expiration,
          bid: (strike * 0.05).toFixed(2),
          ask: (strike * 0.06).toFixed(2),
          volume: Math.floor(Math.random() * 1000),
          openInterest: Math.floor(Math.random() * 5000),
          impliedVolatility: (Math.random() * 0.5 + 0.2).toFixed(4),
        });
        mockOptions.push({
          type: 'PUT',
          strike,
          expiration,
          bid: (strike * 0.04).toFixed(2),
          ask: (strike * 0.05).toFixed(2),
          volume: Math.floor(Math.random() * 1000),
          openInterest: Math.floor(Math.random() * 5000),
          impliedVolatility: (Math.random() * 0.5 + 0.2).toFixed(4),
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        options: mockOptions,
        note: 'Mock data - Schwab OAuth implementation in progress'
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