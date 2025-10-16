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
    const { symbol, interval = '1min', period = 'day' } = await req.json();

    if (!symbol) {
      throw new Error('Symbol is required');
    }

    console.log(`Fetching candles for ${symbol} with interval ${interval}`);

    // Get the authorization header
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

    // Get Schwab access token
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

    // If we have access token, fetch from Schwab
    if (accessToken) {
      try {
        // Map intervals to Schwab API format
        const intervalMap: Record<string, { periodType: string; frequencyType: string; frequency: number }> = {
          '1': { periodType: 'day', frequencyType: 'minute', frequency: 1 },
          '5': { periodType: 'day', frequencyType: 'minute', frequency: 5 },
          '15': { periodType: 'day', frequencyType: 'minute', frequency: 15 },
          '30': { periodType: 'day', frequencyType: 'minute', frequency: 30 },
          '60': { periodType: 'day', frequencyType: 'minute', frequency: 60 },
          '1m': { periodType: 'day', frequencyType: 'minute', frequency: 1 },
          '5m': { periodType: 'day', frequencyType: 'minute', frequency: 5 },
          '15m': { periodType: 'day', frequencyType: 'minute', frequency: 15 },
          '30m': { periodType: 'day', frequencyType: 'minute', frequency: 30 },
          '1h': { periodType: 'day', frequencyType: 'minute', frequency: 60 },
          'D': { periodType: 'month', frequencyType: 'daily', frequency: 1 },
          '1D': { periodType: 'month', frequencyType: 'daily', frequency: 1 },
        };

        const config = intervalMap[interval] || intervalMap['1D'];
        
        console.log(`📊 Interval mapping: ${interval} -> ${config.frequencyType} ${config.frequency}`);
        
        const schwabUrl = new URL(`https://api.schwabapi.com/marketdata/v1/pricehistory`);
        schwabUrl.searchParams.append('symbol', symbol);
        schwabUrl.searchParams.append('periodType', config.periodType);
        schwabUrl.searchParams.append('frequencyType', config.frequencyType);
        schwabUrl.searchParams.append('frequency', config.frequency.toString());
        schwabUrl.searchParams.append('needExtendedHoursData', 'false');

        console.log('Calling Schwab API:', schwabUrl.toString());
        
        const schwabResponse = await fetch(schwabUrl.toString(), {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        });

        if (schwabResponse.ok) {
          const schwabData = await schwabResponse.json();
          console.log('Schwab API response received, processing candles...');
          
          // Transform Schwab data to lightweight-charts format
          const candles = schwabData.candles?.map((candle: any) => ({
            time: Math.floor(candle.datetime / 1000), // Convert to seconds
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume || 0,
          })) || [];

          console.log(`Processed ${candles.length} candles from Schwab`);
          
          return new Response(
            JSON.stringify({ 
              data: candles,
              source: 'schwab',
              symbol: schwabData.symbol,
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        } else {
          const errorText = await schwabResponse.text();
          console.error('Schwab API error:', schwabResponse.status, errorText);
          throw new Error(`Schwab API returned ${schwabResponse.status}`);
        }
      } catch (schwabError) {
        console.error('Error fetching from Schwab:', schwabError);
        throw schwabError;
      }
    }

    // No access token available, use mock data with simulated live updates
    console.log('No access token available, using mock data with live simulation');
    
    // Generate realistic mock candle data
    const now = Date.now();
    const mockCandles = [];
    let basePrice = 150;
    
    // Generate historical candles (past 100 minutes)
    for (let i = 101; i >= 1; i--) {
      const time = Math.floor((now - (i * 60 * 1000)) / 1000); // 1-minute intervals
      const variation = (Math.random() - 0.5) * 5;
      const open = basePrice;
      const close = basePrice + variation;
      const high = Math.max(open, close) + Math.random() * 2;
      const low = Math.min(open, close) - Math.random() * 2;
      const volume = Math.floor(Math.random() * 1000000) + 100000;
      
      mockCandles.push({
        time,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume,
      });
      
      basePrice = close;
    }
    
    // Add current candle with live-like movement
    const currentTime = Math.floor(now / 1000);
    const currentVariation = (Math.random() - 0.5) * 3;
    const currentOpen = basePrice;
    const currentClose = basePrice + currentVariation;
    mockCandles.push({
      time: currentTime,
      open: parseFloat(currentOpen.toFixed(2)),
      high: parseFloat((Math.max(currentOpen, currentClose) + Math.random() * 1.5).toFixed(2)),
      low: parseFloat((Math.min(currentOpen, currentClose) - Math.random() * 1.5).toFixed(2)),
      close: parseFloat(currentClose.toFixed(2)),
      volume: Math.floor(Math.random() * 500000) + 50000,
    });
    
    console.log(`Generated ${mockCandles.length} mock candles`);
    
    return new Response(
      JSON.stringify({ 
        data: mockCandles,
        source: 'mock',
        symbol,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-schwab-candles:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
