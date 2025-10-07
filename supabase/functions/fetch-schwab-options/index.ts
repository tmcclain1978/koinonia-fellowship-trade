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

    // Try to get Schwab access token
    let accessToken = null;
    try {
      const { data: tokenData, error: tokenError } = await supabase.functions.invoke(
        "schwab-get-access-token",
        {
          headers: { Authorization: authHeader },
        }
      );
      
      if (!tokenError && tokenData?.access_token) {
        accessToken = tokenData.access_token;
        console.log('Successfully obtained Schwab access token');
      }
    } catch (error) {
      console.log('Could not get Schwab access token, using mock data:', error);
    }

    // If we have an access token, call the real Schwab API
    if (accessToken) {
      try {
        const schwabUrl = `https://api.schwabapi.com/marketdata/v1/chains?symbol=${symbol}`;
        
        const schwabResponse = await fetch(schwabUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        });

        if (schwabResponse.ok) {
          const schwabData = await schwabResponse.json();
          
          // Transform Schwab data to our format
          const options = [];
          
          // Process call options
          if (schwabData.callExpDateMap) {
            for (const [expDate, strikes] of Object.entries(schwabData.callExpDateMap)) {
              for (const [strike, contracts] of Object.entries(strikes as any)) {
                const contract = (contracts as any[])[0];
                options.push({
                  type: 'CALL',
                  strike: parseFloat(strike),
                  expiration: expDate.split(':')[0],
                  bid: contract.bid,
                  ask: contract.ask,
                  volume: contract.totalVolume,
                  openInterest: contract.openInterest,
                  impliedVolatility: contract.volatility,
                });
              }
            }
          }

          // Process put options
          if (schwabData.putExpDateMap) {
            for (const [expDate, strikes] of Object.entries(schwabData.putExpDateMap)) {
              for (const [strike, contracts] of Object.entries(strikes as any)) {
                const contract = (contracts as any[])[0];
                options.push({
                  type: 'PUT',
                  strike: parseFloat(strike),
                  expiration: expDate.split(':')[0],
                  bid: contract.bid,
                  ask: contract.ask,
                  volume: contract.totalVolume,
                  openInterest: contract.openInterest,
                  impliedVolatility: contract.volatility,
                });
              }
            }
          }

          return new Response(
            JSON.stringify({ 
              options,
              source: 'schwab',
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }
      } catch (schwabError) {
        console.error('Schwab API error, falling back to mock data:', schwabError);
      }
    }

    // Fallback to mock data for paper trading
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
        source: 'mock',
        note: 'Using mock data - complete Schwab OAuth in Settings for live data'
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