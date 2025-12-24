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
    const { symbol, interval = '1min', period = 'day', startDate, endDate, premarket = false } = await req.json();

    if (!symbol) {
      throw new Error('Symbol is required');
    }

    console.log(`Fetching candles for ${symbol} with interval ${interval}, startDate: ${startDate}, endDate: ${endDate}`);

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
        const intervalMap: Record<string, { periodType: string; frequencyType: string; frequency: number; period?: number }> = {
          '1': { periodType: 'day', frequencyType: 'minute', frequency: 1 },
          '5': { periodType: 'day', frequencyType: 'minute', frequency: 5 },
          '15': { periodType: 'day', frequencyType: 'minute', frequency: 15 },
          '30': { periodType: 'day', frequencyType: 'minute', frequency: 30 },
          '60': { periodType: 'day', frequencyType: 'minute', frequency: 60 },
          '1m': { periodType: 'day', frequencyType: 'minute', frequency: 1 },
          '5m': { periodType: 'day', frequencyType: 'minute', frequency: 5 },
          'minute': { periodType: 'day', frequencyType: 'minute', frequency: 1 },
          '5minute': { periodType: 'day', frequencyType: 'minute', frequency: 5 },
          '15minute': { periodType: 'day', frequencyType: 'minute', frequency: 15 },
          '30minute': { periodType: 'day', frequencyType: 'minute', frequency: 30 },
          'hour': { periodType: 'day', frequencyType: 'minute', frequency: 60 },
          '15m': { periodType: 'day', frequencyType: 'minute', frequency: 15 },
          '30m': { periodType: 'day', frequencyType: 'minute', frequency: 30 },
          '1h': { periodType: 'day', frequencyType: 'minute', frequency: 60 },
          'D': { periodType: 'year', frequencyType: 'daily', frequency: 1, period: 10 },
          '1D': { periodType: 'year', frequencyType: 'daily', frequency: 1, period: 10 },
          'daily': { periodType: 'year', frequencyType: 'daily', frequency: 1, period: 10 },
          'W': { periodType: 'year', frequencyType: 'weekly', frequency: 1, period: 20 },
          '1W': { periodType: 'year', frequencyType: 'weekly', frequency: 1, period: 20 },
          'weekly': { periodType: 'year', frequencyType: 'weekly', frequency: 1, period: 20 },
          'M': { periodType: 'year', frequencyType: 'monthly', frequency: 1, period: 20 },
          '1M': { periodType: 'year', frequencyType: 'monthly', frequency: 1, period: 20 },
          'monthly': { periodType: 'year', frequencyType: 'monthly', frequency: 1, period: 20 },
        };

        const config = intervalMap[interval] || intervalMap['daily'];
        
        console.log(`📊 Interval mapping: ${interval} -> ${config.frequencyType} ${config.frequency}`);
        
        const schwabUrl = new URL(`https://api.schwabapi.com/marketdata/v1/pricehistory`);
        schwabUrl.searchParams.append('symbol', symbol);
        schwabUrl.searchParams.append('frequencyType', config.frequencyType);
        schwabUrl.searchParams.append('frequency', config.frequency.toString());
        schwabUrl.searchParams.append('needExtendedHoursData', premarket ? 'true' : 'false');

        // If custom date range is provided, use startDate and endDate
        if (startDate && endDate) {
          const startMs = new Date(startDate).getTime();
          const endMs = new Date(endDate).getTime();
          schwabUrl.searchParams.append('startDate', startMs.toString());
          schwabUrl.searchParams.append('endDate', endMs.toString());
          console.log(`Using custom date range: ${startDate} to ${endDate}`);
        } else {
          schwabUrl.searchParams.append('periodType', config.periodType);
          if (config.period) {
            schwabUrl.searchParams.append('period', config.period.toString());
          }
        }

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
        // Fall through to mock data
      }
    }

    // No access token available or Schwab failed, try Polygon.io for historical data
    const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
    if (polygonApiKey && startDate && endDate) {
      try {
        console.log('Trying Polygon.io for historical data...');
        
        // Map interval to Polygon format
        const polygonIntervalMap: Record<string, { multiplier: number; timespan: string }> = {
          'minute': { multiplier: 1, timespan: 'minute' },
          '5minute': { multiplier: 5, timespan: 'minute' },
          '15minute': { multiplier: 15, timespan: 'minute' },
          '30minute': { multiplier: 30, timespan: 'minute' },
          'hour': { multiplier: 1, timespan: 'hour' },
          'daily': { multiplier: 1, timespan: 'day' },
          'weekly': { multiplier: 1, timespan: 'week' },
          'monthly': { multiplier: 1, timespan: 'month' },
          '1D': { multiplier: 1, timespan: 'day' },
          '1W': { multiplier: 1, timespan: 'week' },
          '1M': { multiplier: 1, timespan: 'month' },
        };
        
        const polyConfig = polygonIntervalMap[interval] || { multiplier: 1, timespan: 'day' };
        
        const polygonUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${polyConfig.multiplier}/${polyConfig.timespan}/${startDate}/${endDate}?adjusted=true&sort=asc&limit=50000&apiKey=${polygonApiKey}`;
        
        const polygonResponse = await fetch(polygonUrl);
        
        if (polygonResponse.ok) {
          const polygonData = await polygonResponse.json();
          
          if (polygonData.results && polygonData.results.length > 0) {
            const candles = polygonData.results.map((bar: any) => ({
              time: Math.floor(bar.t / 1000),
              open: bar.o,
              high: bar.h,
              low: bar.l,
              close: bar.c,
              volume: bar.v || 0,
            }));
            
            console.log(`Processed ${candles.length} candles from Polygon.io`);
            
            return new Response(
              JSON.stringify({ 
                data: candles,
                source: 'polygon',
                symbol,
              }),
              { 
                status: 200, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }
        }
      } catch (polygonError) {
        console.error('Error fetching from Polygon:', polygonError);
      }
    }

    // Try Alpha Vantage as fallback
    const alphaVantageKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
    if (alphaVantageKey) {
      try {
        console.log('Trying Alpha Vantage for historical data...');
        
        const functionType = interval.includes('D') || interval === 'daily' ? 'TIME_SERIES_DAILY' : 'TIME_SERIES_INTRADAY';
        let avUrl = `https://www.alphavantage.co/query?function=${functionType}&symbol=${symbol}&apikey=${alphaVantageKey}&outputsize=full`;
        
        if (functionType === 'TIME_SERIES_INTRADAY') {
          const avIntervalMap: Record<string, string> = {
            'minute': '1min',
            '5minute': '5min',
            '15minute': '15min',
            '30minute': '30min',
            'hour': '60min',
          };
          avUrl += `&interval=${avIntervalMap[interval] || '5min'}`;
        }
        
        const avResponse = await fetch(avUrl);
        
        if (avResponse.ok) {
          const avData = await avResponse.json();
          const timeSeriesKey = Object.keys(avData).find(k => k.includes('Time Series'));
          
          if (timeSeriesKey && avData[timeSeriesKey]) {
            const timeSeries = avData[timeSeriesKey];
            const candles = Object.entries(timeSeries)
              .map(([datetime, values]: [string, any]) => ({
                time: Math.floor(new Date(datetime).getTime() / 1000),
                open: parseFloat(values['1. open']),
                high: parseFloat(values['2. high']),
                low: parseFloat(values['3. low']),
                close: parseFloat(values['4. close']),
                volume: parseInt(values['5. volume'] || '0'),
              }))
              .filter(candle => {
                if (!startDate || !endDate) return true;
                const candleDate = new Date(candle.time * 1000);
                return candleDate >= new Date(startDate) && candleDate <= new Date(endDate);
              })
              .sort((a, b) => a.time - b.time);
            
            if (candles.length > 0) {
              console.log(`Processed ${candles.length} candles from Alpha Vantage`);
              
              return new Response(
                JSON.stringify({ 
                  data: candles,
                  source: 'alphavantage',
                  symbol,
                }),
                { 
                  status: 200, 
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
                }
              );
            }
          }
        }
      } catch (avError) {
        console.error('Error fetching from Alpha Vantage:', avError);
      }
    }

    // No access token available, use mock data with simulated live updates
    console.log('No access token available, trying to get current price for realistic mock data');
    
    // Try to get current price from Polygon for accurate base price
    let basePrice = 150;
    if (polygonApiKey) {
      try {
        const prevResponse = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${polygonApiKey}`
        );
        const prevData = await prevResponse.json();
        if (prevData.results?.[0]?.c) {
          basePrice = prevData.results[0].c;
          console.log(`Got current price from Polygon: $${basePrice}`);
        }
      } catch (e) {
        console.log('Could not fetch current price from Polygon, using default');
      }
    }
    
    // Map interval to milliseconds for proper candle spacing
    const intervalMs: Record<string, number> = {
      '1': 60 * 1000,           // 1 minute
      '5': 5 * 60 * 1000,       // 5 minutes
      '15': 15 * 60 * 1000,     // 15 minutes
      '30': 30 * 60 * 1000,     // 30 minutes
      '60': 60 * 60 * 1000,     // 1 hour
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      'minute': 60 * 1000,
      '5minute': 5 * 60 * 1000,
      '15minute': 15 * 60 * 1000,
      '30minute': 30 * 60 * 1000,
      'hour': 60 * 60 * 1000,
      'D': 24 * 60 * 60 * 1000,
      '1D': 24 * 60 * 60 * 1000,
      'daily': 24 * 60 * 60 * 1000,
    };
    
    const candleInterval = intervalMs[interval] || 60 * 1000;
    const numCandles = 100;
    
    // Generate realistic mock candle data
    const now = Date.now();
    // Align to current interval boundary
    const currentCandleStart = Math.floor(now / candleInterval) * candleInterval;
    const mockCandles = [];
    let currentPrice = basePrice;
    
    // Generate historical candles working backwards
    for (let i = numCandles; i >= 0; i--) {
      const candleTime = currentCandleStart - (i * candleInterval);
      const time = Math.floor(candleTime / 1000);
      
      // Random walk with slight upward bias matching actual stock behavior
      const volatility = basePrice * 0.003; // 0.3% per candle
      const variation = (Math.random() - 0.48) * volatility * 2;
      
      const open = currentPrice;
      const close = currentPrice + variation;
      const range = Math.abs(variation) + (Math.random() * volatility);
      const high = Math.max(open, close) + Math.random() * range;
      const low = Math.min(open, close) - Math.random() * range;
      const volume = Math.floor(Math.random() * 500000) + 100000;
      
      mockCandles.push({
        time,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume,
      });
      
      currentPrice = close;
    }
    
    console.log(`Generated ${mockCandles.length} mock candles for ${symbol} at interval ${interval}ms, base price: $${basePrice}`);
    
    return new Response(
      JSON.stringify({ 
        data: mockCandles,
        source: 'mock',
        symbol,
        note: `Mock data based on current price $${basePrice.toFixed(2)}. Connect Schwab for live data.`,
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
