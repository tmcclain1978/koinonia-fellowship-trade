import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SCHWAB_API_BASE = 'https://api.schwabapi.com/marketdata/v1';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { symbols, fields = 'all', indicative = false } = await req.json();

    if (!symbols || (Array.isArray(symbols) && symbols.length === 0)) {
      throw new Error('symbols is required');
    }

    // Get Schwab access token
    const { data: tokenData, error: tokenError } = await supabase.functions.invoke(
      "schwab-get-access-token",
      { headers: { Authorization: authHeader } }
    );

    if (tokenError || !tokenData?.access_token) {
      console.log('[schwab-quotes] No access token, returning mock data');
      // Return mock data if no token available
      return returnMockQuotes(symbols);
    }

    const accessToken = tokenData.access_token;
    const symbolList = Array.isArray(symbols) ? symbols.join(',') : symbols;
    
    console.log(`[schwab-quotes] Fetching quotes for: ${symbolList}`);

    // Build endpoint
    const params = new URLSearchParams();
    params.append('symbols', symbolList);
    if (fields) params.append('fields', fields);
    if (indicative) params.append('indicative', 'true');

    const endpoint = `${SCHWAB_API_BASE}/quotes?${params.toString()}`;
    console.log(`[schwab-quotes] Calling: ${endpoint}`);

    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[schwab-quotes] API Error ${response.status}:`, errorText);
      
      if (response.status === 401) {
        throw new Error('Access token expired. Please re-authenticate in Settings.');
      }
      
      throw new Error(`Schwab API error (${response.status}): ${errorText}`);
    }

    const quotes = await response.json();
    console.log(`[schwab-quotes] Retrieved quotes for ${Object.keys(quotes).length} symbols`);

    // Transform to a more usable format
    const formattedQuotes = Object.entries(quotes).map(([symbol, data]: [string, any]) => ({
      symbol,
      lastPrice: data.quote?.lastPrice || data.regular?.regularMarketLastPrice,
      bidPrice: data.quote?.bidPrice,
      askPrice: data.quote?.askPrice,
      bidSize: data.quote?.bidSize,
      askSize: data.quote?.askSize,
      volume: data.quote?.totalVolume,
      openPrice: data.quote?.openPrice,
      highPrice: data.quote?.highPrice,
      lowPrice: data.quote?.lowPrice,
      closePrice: data.quote?.closePrice,
      netChange: data.quote?.netChange,
      netPercentChange: data.quote?.netPercentChange,
      high52Week: data.quote?.['52WeekHigh'],
      low52Week: data.quote?.['52WeekLow'],
      mark: data.quote?.mark,
      postMarketChange: data.quote?.postMarketChange,
      // Fundamental data
      peRatio: data.fundamental?.peRatio,
      eps: data.fundamental?.eps,
      divYield: data.fundamental?.divYield,
      divAmount: data.fundamental?.divAmount,
      avg10DaysVolume: data.fundamental?.avg10DaysVolume,
      // Reference data
      description: data.reference?.description,
      exchange: data.reference?.exchangeName,
      isShortable: data.reference?.isShortable,
      // Full raw data for advanced use
      raw: data,
    }));

    return new Response(
      JSON.stringify({ 
        success: true,
        quotes: formattedQuotes,
        source: 'schwab',
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[schwab-quotes] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function returnMockQuotes(symbols: string | string[]) {
  const symbolList = Array.isArray(symbols) ? symbols : symbols.split(',');
  
  const mockQuotes = symbolList.map(symbol => {
    const basePrice = symbol === 'AAPL' ? 175 : 
                      symbol === 'MSFT' ? 375 : 
                      symbol === 'GOOGL' ? 140 :
                      symbol === 'AMZN' ? 180 :
                      symbol === 'TSLA' ? 250 :
                      100 + Math.random() * 200;
    
    const change = (Math.random() - 0.5) * 5;
    
    return {
      symbol: symbol.trim().toUpperCase(),
      lastPrice: parseFloat(basePrice.toFixed(2)),
      bidPrice: parseFloat((basePrice - 0.02).toFixed(2)),
      askPrice: parseFloat((basePrice + 0.02).toFixed(2)),
      bidSize: Math.floor(Math.random() * 100) + 1,
      askSize: Math.floor(Math.random() * 100) + 1,
      volume: Math.floor(Math.random() * 10000000) + 1000000,
      openPrice: parseFloat((basePrice - change / 2).toFixed(2)),
      highPrice: parseFloat((basePrice + Math.abs(change)).toFixed(2)),
      lowPrice: parseFloat((basePrice - Math.abs(change)).toFixed(2)),
      closePrice: parseFloat((basePrice - change).toFixed(2)),
      netChange: parseFloat(change.toFixed(2)),
      netPercentChange: parseFloat((change / basePrice * 100).toFixed(2)),
      high52Week: parseFloat((basePrice * 1.3).toFixed(2)),
      low52Week: parseFloat((basePrice * 0.7).toFixed(2)),
      mark: parseFloat(basePrice.toFixed(2)),
      description: `${symbol.trim().toUpperCase()} Inc.`,
      exchange: 'NASDAQ',
      source: 'mock',
    };
  });

  return new Response(
    JSON.stringify({ 
      success: true,
      quotes: mockQuotes,
      source: 'mock',
      note: 'Using mock data - complete Schwab OAuth in Settings for live data',
    }),
    { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}
