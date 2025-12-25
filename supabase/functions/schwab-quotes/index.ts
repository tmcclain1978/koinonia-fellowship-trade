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
    
    // On network errors, try to return fallback data instead of failing
    const errorMessage = error.message?.toLowerCase() || '';
    if (errorMessage.includes('network') || errorMessage.includes('connection') || errorMessage.includes('fetch')) {
      console.log('[schwab-quotes] Network error, returning fallback data');
      try {
        const { symbols } = await req.clone().json().catch(() => ({ symbols: ['AAPL'] }));
        return returnMockQuotes(symbols || ['AAPL']);
      } catch (fallbackError) {
        console.error('[schwab-quotes] Fallback also failed:', fallbackError);
      }
    }
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function returnMockQuotes(symbols: string | string[]) {
  const symbolList = Array.isArray(symbols) ? symbols : symbols.split(',');
  const POLYGON_API_KEY = Deno.env.get('POLYGON_API_KEY');
  
  // Try to get real prices from Polygon first
  const mockQuotes = await Promise.all(symbolList.map(async (symbol) => {
    const sym = symbol.trim().toUpperCase();
    let basePrice = sym === 'AAPL' ? 250 : 
                    sym === 'MSFT' ? 430 : 
                    sym === 'GOOGL' ? 190 :
                    sym === 'AMZN' ? 220 :
                    sym === 'TSLA' ? 420 :
                    sym === 'SPY' ? 600 :
                    sym === 'QQQ' ? 520 :
                    sym === 'NVDA' ? 140 :
                    100 + Math.random() * 200;
    
    // Try to get real price from Polygon
    if (POLYGON_API_KEY) {
      try {
        const prevResponse = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
        );
        const prevData = await prevResponse.json();
        if (prevData.results?.[0]?.c) {
          basePrice = prevData.results[0].c;
          console.log(`[schwab-quotes] Got ${sym} price from Polygon: $${basePrice}`);
        }
      } catch (e) {
        console.log(`[schwab-quotes] Could not fetch ${sym} from Polygon`);
      }
    }
    
    const change = (Math.random() - 0.5) * (basePrice * 0.02); // 2% max change
    
    return {
      symbol: sym,
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
      description: `${sym} Inc.`,
      exchange: 'NASDAQ',
      source: POLYGON_API_KEY ? 'polygon-fallback' : 'mock',
    };
  }));

  return new Response(
    JSON.stringify({ 
      success: true,
      quotes: mockQuotes,
      source: POLYGON_API_KEY ? 'polygon-fallback' : 'mock',
      note: 'Using fallback data - complete Schwab OAuth in Settings for live streaming',
    }),
    { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}
