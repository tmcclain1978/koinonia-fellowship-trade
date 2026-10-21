import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Schwab marks unavailable greeks with sentinel values such as -999.
const finiteOrNull = (v: unknown, min = -1e6, max = 1e6) =>
  typeof v === 'number' && Number.isFinite(v) && v > min && v < max ? v : null;

/** Fields used by the chart's options levels (gamma exposure, expected move). */
const extraFields = (contract: any) => ({
  gamma: finiteOrNull(contract.gamma, -1, 10),
  mark: finiteOrNull(contract.mark, -1, 1e6),
  daysToExpiration: finiteOrNull(contract.daysToExpiration, -1, 5000),
  occSymbol: typeof contract.symbol === 'string' ? contract.symbol : null,
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, fromDate, toDate, strikeCount } = await req.json();

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
      console.log('Could not get Schwab access token:', error);
    }

    // If we have an access token, call the real Schwab API
    if (accessToken) {
      try {
        // Optional window (YYYY-MM-DD) and strikes around the money keep the
        // response small for chart overlays; without them the full chain is returned.
        const params = new URLSearchParams({ symbol: String(symbol).toUpperCase() });
        const isDate = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
        if (isDate(fromDate)) params.set('fromDate', fromDate);
        if (isDate(toDate)) params.set('toDate', toDate);
        if (Number.isInteger(strikeCount) && strikeCount > 0 && strikeCount <= 200) params.set('strikeCount', String(strikeCount));
        const schwabUrl = `https://api.schwabapi.com/marketdata/v1/chains?${params.toString()}`;
        
        console.log('Calling Schwab API for', symbol);
        const schwabResponse = await fetch(schwabUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        });

        if (schwabResponse.ok) {
          const schwabData = await schwabResponse.json();
          console.log('Schwab API response status:', schwabResponse.status);
          console.log('Sample Schwab data keys:', Object.keys(schwabData));
          
          // Transform Schwab data to our format
          const options = [];
          
          // Process call options
          if (schwabData.callExpDateMap) {
            for (const [expDate, strikes] of Object.entries(schwabData.callExpDateMap)) {
              for (const [strike, contracts] of Object.entries(strikes as any)) {
                const contract = (contracts as any[])[0];
                
                // Log a sample contract to see the structure
                if (options.length === 0) {
                  console.log('Sample CALL contract:', JSON.stringify(contract, null, 2));
                }
                
                options.push({
                  type: 'CALL',
                  strike: parseFloat(strike),
                  expiration: expDate.split(':')[0],
                  bid: contract.bid || 0,
                  ask: contract.ask || 0,
                  volume: contract.totalVolume || 0,
                  openInterest: contract.openInterest || 0,
                  impliedVolatility: contract.volatility || 0,
                  delta: contract.delta || null,
                  ...extraFields(contract),
                });
              }
            }
          }

          // Process put options
          if (schwabData.putExpDateMap) {
            for (const [expDate, strikes] of Object.entries(schwabData.putExpDateMap)) {
              const cleanExpDate = expDate.split(':')[0];
              
              for (const [strikeKey, contracts] of Object.entries(strikes as any)) {
                const contractsArray = contracts as any[];
                const strike = parseFloat(strikeKey);
                
                const contract = contractsArray[0];
                
                options.push({
                  type: 'PUT',
                  strike: strike,
                  expiration: cleanExpDate,
                  bid: contract.bid || 0,
                  ask: contract.ask || 0,
                  volume: contract.totalVolume || 0,
                  openInterest: contract.openInterest || 0,
                  impliedVolatility: contract.volatility || 0,
                  delta: contract.delta || null,
                  ...extraFields(contract),
                });
              }
            }
          }

          console.log(`Processed ${options.length} total options from Schwab`);
          
          return new Response(
            JSON.stringify({ 
              options,
              source: 'schwab',
              underlyingPrice: schwabData.underlyingPrice || null,
              isDelayed: schwabData.isDelayed ?? null,
              asOf: Date.now(),
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        } else {
          console.error('Schwab API returned non-OK status:', schwabResponse.status);
        }
      } catch (schwabError) {
        console.error('Schwab API error:', schwabError);
      }
    } else {
      console.log('No access token available');
    }

    // No made-up chains: say plainly that real data isn't available.
    // (This used to return a generated chain with fixed strikes 150-200 and
    // random volume/IV, which paper trades could fill against.)
    return new Response(
      JSON.stringify({
        options: [],
        source: 'unavailable',
        error: accessToken
          ? 'Schwab did not return an option chain right now. Try again shortly.'
          : 'Option chains need a Schwab connection. Connect Schwab in Settings.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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