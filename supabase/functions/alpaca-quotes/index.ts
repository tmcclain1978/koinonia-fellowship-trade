import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    // Get user's Alpaca credentials
    const { data: credentials, error: credError } = await supabase
      .from('user_api_credentials')
      .select('alpaca_api_key, alpaca_secret_key, alpaca_paper_mode')
      .eq('user_id', user.id)
      .single();

    if (credError || !credentials) {
      throw new Error('Alpaca credentials not found. Please configure them in Settings.');
    }

    if (!credentials.alpaca_api_key || !credentials.alpaca_secret_key) {
      throw new Error('Alpaca API key and secret are required');
    }

    // Alpaca data API base URL (same for paper and live)
    const dataBaseUrl = 'https://data.alpaca.markets';

    const { action, symbols, timeframe, start, end, limit } = await req.json();

    const headers = {
      'APCA-API-KEY-ID': credentials.alpaca_api_key,
      'APCA-API-SECRET-KEY': credentials.alpaca_secret_key,
      'Content-Type': 'application/json',
    };

    if (action === 'bars') {
      // Get historical bars
      console.log('Fetching Alpaca bars...');
      
      const symbolList = Array.isArray(symbols) ? symbols.join(',') : symbols;
      let barsUrl = `${dataBaseUrl}/v2/stocks/bars?symbols=${symbolList}&timeframe=${timeframe || '1Day'}`;
      
      if (start) barsUrl += `&start=${start}`;
      if (end) barsUrl += `&end=${end}`;
      if (limit) barsUrl += `&limit=${limit}`;

      const response = await fetch(barsUrl, { headers });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Alpaca bars error (${response.status}):`, errorText);
        throw new Error(`Alpaca API error: ${response.status}`);
      }

      const data = await response.json();

      return new Response(
        JSON.stringify({ bars: data.bars || {} }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default: Get latest quotes/trades/bars (snapshot)
    console.log('Fetching Alpaca snapshots...');
    
    const symbolList = Array.isArray(symbols) ? symbols : [symbols];
    const quotes: any[] = [];

    // Fetch snapshots for each symbol
    for (const symbol of symbolList) {
      try {
        const snapshotUrl = `${dataBaseUrl}/v2/stocks/${symbol}/snapshot`;
        const response = await fetch(snapshotUrl, { headers });

        if (response.ok) {
          const snapshot = await response.json();
          quotes.push({
            symbol,
            latestTrade: snapshot.latestTrade,
            latestQuote: snapshot.latestQuote,
            dailyBar: snapshot.dailyBar,
            previousDailyBar: snapshot.prevDailyBar,
          });
        } else {
          console.warn(`Failed to get snapshot for ${symbol}: ${response.status}`);
          // Add placeholder
          quotes.push({
            symbol,
            latestTrade: null,
            latestQuote: null,
            dailyBar: null,
          });
        }
      } catch (e) {
        console.error(`Error fetching snapshot for ${symbol}:`, e);
        quotes.push({
          symbol,
          latestTrade: null,
          latestQuote: null,
          dailyBar: null,
        });
      }
    }

    return new Response(
      JSON.stringify({ quotes }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in alpaca-quotes:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
