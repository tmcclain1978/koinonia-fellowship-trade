import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SCHWAB_API_BASE = 'https://api.schwabapi.com/marketdata/v1';

// In-memory cache to prevent rate limiting
const quoteCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 5000; // 5 second cache TTL (increased from 3s)
const lastApiCallTime = { value: 0 };
const MIN_API_INTERVAL_MS = 3000; // Minimum 3 seconds between Schwab API calls (increased from 2s)
const pendingRequest: { promise: Promise<Response> | null; symbols: string } = { promise: null, symbols: '' };

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Parse body early and store for potential fallback use
  let symbols: string | string[] = ['AAPL'];
  let fields = 'all';
  let indicative = false;
  
  try {
    const body = await req.json();
    symbols = body.symbols || ['AAPL'];
    fields = body.fields || 'all';
    indicative = body.indicative || false;
  } catch (parseError) {
    console.log('[schwab-quotes] Could not parse request body, using defaults');
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.log('[schwab-quotes] No auth header, returning mock data');
      return returnMockQuotes(symbols);
    }

    if (!symbols || (Array.isArray(symbols) && symbols.length === 0)) {
      console.log('[schwab-quotes] No symbols, returning mock data');
      return returnMockQuotes(['AAPL']);
    }

    const symbolList = Array.isArray(symbols) ? symbols.join(',') : symbols;
    const cacheKey = `${symbolList}-${fields}`;
    const now = Date.now();

    // Check cache first - BEFORE any Supabase/token operations
    const cachedResult = quoteCache.get(cacheKey);
    if (cachedResult && (now - cachedResult.timestamp) < CACHE_TTL_MS) {
      console.log(`[schwab-quotes] Returning cached data for: ${symbolList}`);
      return new Response(
        JSON.stringify({ 
          success: true,
          quotes: cachedResult.data,
          source: 'schwab-cached',
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Rate limit check - return cached or mock BEFORE expensive operations
    const timeSinceLastCall = now - lastApiCallTime.value;
    if (timeSinceLastCall < MIN_API_INTERVAL_MS) {
      console.log(`[schwab-quotes] Rate limiting - ${MIN_API_INTERVAL_MS - timeSinceLastCall}ms until next call allowed`);
      if (cachedResult) {
        return new Response(
          JSON.stringify({ 
            success: true,
            quotes: cachedResult.data,
            source: 'schwab-cached',
            note: 'Rate limited - using cached data',
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
      return returnMockQuotes(symbols);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Schwab access token with timeout
    let tokenData = null;
    try {
      const tokenPromise = supabase.functions.invoke(
        "schwab-get-access-token",
        { headers: { Authorization: authHeader } }
      );
      
      // Add 8 second timeout for token fetch
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Token fetch timeout')), 8000)
      );
      
      const result = await Promise.race([tokenPromise, timeoutPromise]) as any;
      if (!result.error && result.data?.access_token) {
        tokenData = result.data;
      }
    } catch (tokenError) {
      console.log('[schwab-quotes] Token fetch failed:', (tokenError as any).message);
    }

    if (!tokenData?.access_token) {
      console.log('[schwab-quotes] No access token, returning mock data');
      return returnMockQuotes(symbols);
    }

    const accessToken = tokenData.access_token;
    
    console.log(`[schwab-quotes] Fetching quotes for: ${symbolList}`);

    // Update last API call time BEFORE making the request
    lastApiCallTime.value = now;

    // Build endpoint
    const params = new URLSearchParams();
    params.append('symbols', symbolList);
    if (fields) params.append('fields', fields);
    if (indicative) params.append('indicative', 'true');

    const endpoint = `${SCHWAB_API_BASE}/quotes?${params.toString()}`;
    console.log(`[schwab-quotes] Calling: ${endpoint}`);

    // Fetch with timeout and network error handling
    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      // Handle network errors, timeouts, and aborts gracefully
      console.log(`[schwab-quotes] Fetch failed (${fetchError.name}): ${fetchError.message}`);
      if (cachedResult) {
        return new Response(
          JSON.stringify({
            success: true,
            quotes: cachedResult.data,
            source: 'schwab-cached',
            note: 'Network error - using cached data',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return returnMockQuotes(symbols);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[schwab-quotes] API Error ${response.status}:`, errorText);

      if (response.status === 401) {
        console.log('[schwab-quotes] Token expired, returning mock data');
        return returnMockQuotes(symbols);
      }

      if (response.status === 429) {
        console.log('[schwab-quotes] Schwab rate limit (429)');
        if (cachedResult) {
          return new Response(
            JSON.stringify({
              success: true,
              quotes: cachedResult.data,
              source: 'schwab-cached',
              note: 'Schwab 429 - using cached data',
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
        return returnMockQuotes(symbols);
      }

      console.log('[schwab-quotes] API error, returning mock data');
      return returnMockQuotes(symbols);
    }

    const quotes = await response.json();
    console.log(`[schwab-quotes] Retrieved quotes for ${Object.keys(quotes).length} symbols`);

    // Transform to a more usable format
    const fetchedAt = Date.now();
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
      fetchedAt,
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
      assetMainType: data.assetMainType,
      // Options (Schwab sends -999 when a Greek isn't calculated; passed through as-is)
      delta: data.quote?.delta,
      gamma: data.quote?.gamma,
      theta: data.quote?.theta,
      vega: data.quote?.vega,
      rho: data.quote?.rho,
      volatility: data.quote?.volatility,
      underlyingPrice: data.quote?.underlyingPrice,
      openInterest: data.quote?.openInterest,
      multiplier: data.reference?.multiplier ?? data.reference?.futureMultiplier,
      // Futures
      settlementPrice: data.quote?.settlePrice ?? data.quote?.settlementPrice,
      futureExpirationDate: data.reference?.futureExpirationDate,
      futureActiveSymbol: data.reference?.futureActiveSymbol,
      // NOTE: raw response omitted to keep payload small and prevent connection drops
    }));

    // Cache the result (reuse the cacheKey we computed above)
    quoteCache.set(cacheKey, { data: formattedQuotes, timestamp: Date.now() });
    console.log(`[schwab-quotes] Cached ${formattedQuotes.length} quotes`);

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
    console.error('[schwab-quotes] Error:', (error as any).message);
    
    // Always return mock data on any error - never return 500
    console.log('[schwab-quotes] Returning mock data due to error');
    return returnMockQuotes(symbols);
  }
});

async function returnMockQuotes(symbols: string | string[]) {
  const symbolList = Array.isArray(symbols) ? symbols : symbols.split(',');
  const POLYGON_API_KEY = Deno.env.get('POLYGON_API_KEY');
  const FMP_API_KEY = Deno.env.get('FMP_API_KEY');
  
  // Fallback quotes only report values a real source returned. Nothing is
  // invented: fields we don't have are left out, and a symbol with no price
  // from any source is omitted (it used to come back as a $100 placeholder
  // with random volume/high/low/change, which flowed into charts and order
  // tickets).
  const fallbackQuotes = await Promise.all(symbolList.map(async (symbol) => {
    const sym = symbol.trim().toUpperCase();

    // Polygon (preferred): previous session's daily bar. This is NOT a live
    // price, so it is flagged isPreviousClose and carries no intraday fields.
    if (POLYGON_API_KEY) {
      try {
        const prevResponse = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
        );
        const prevData = await prevResponse.json();
        const bar = prevData.results?.[0];
        if (bar?.c) {
          console.log(`[schwab-quotes] Using Polygon previous close for ${sym}: $${bar.c}`);
          return {
            symbol: sym,
            lastPrice: bar.c,
            closePrice: bar.c,
            mark: bar.c,
            isPreviousClose: true,
            asOf: bar.t,
            source: 'polygon-fallback',
          };
        }
      } catch (e) {
        console.log(`[schwab-quotes] Could not fetch ${sym} from Polygon`);
      }
    }

    // FMP: a current quote; pass through the fields it actually provides.
    if (FMP_API_KEY) {
      try {
        const fmpResponse = await fetch(
          `https://financialmodelingprep.com/api/v3/quote/${sym}?apikey=${FMP_API_KEY}`
        );
        const fmpData = await fmpResponse.json();
        const q = Array.isArray(fmpData) ? fmpData[0] : null;
        if (q?.price) {
          console.log(`[schwab-quotes] Using FMP quote for ${sym}: $${q.price}`);
          return {
            symbol: sym,
            lastPrice: q.price,
            mark: q.price,
            volume: q.volume ?? undefined,
            openPrice: q.open ?? undefined,
            highPrice: q.dayHigh ?? undefined,
            lowPrice: q.dayLow ?? undefined,
            closePrice: q.previousClose ?? undefined,
            netChange: q.change ?? undefined,
            netPercentChange: q.changesPercentage ?? undefined,
            high52Week: q.yearHigh ?? undefined,
            low52Week: q.yearLow ?? undefined,
            description: q.name ?? undefined,
            exchange: q.exchange ?? undefined,
            asOf: typeof q.timestamp === 'number' ? q.timestamp * 1000 : undefined,
            source: 'fmp-fallback',
          };
        }
      } catch (e) {
        console.log(`[schwab-quotes] Could not fetch ${sym} from FMP`);
      }
    }

    console.log(`[schwab-quotes] No price available for ${sym} from any source`);
    return null;
  }));
  const mockQuotes = fallbackQuotes.filter((q): q is NonNullable<typeof q> => q !== null);

  // Determine overall source for the response
  const sources = mockQuotes.map(q => q.source);
  const primarySource = sources.includes('polygon-fallback') ? 'polygon-fallback' :
                        sources.includes('fmp-fallback') ? 'fmp-fallback' : 'unavailable';

  return new Response(
    JSON.stringify({ 
      success: true,
      quotes: mockQuotes,
      source: primarySource,
      note: 'Using fallback data - complete Schwab OAuth in Settings for live streaming',
    }),
    { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}
