import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbols, action } = await req.json();
    const POLYGON_API_KEY = Deno.env.get('POLYGON_API_KEY');

    if (!POLYGON_API_KEY) {
      console.error('❌ POLYGON_API_KEY not configured');
      return new Response(
        JSON.stringify({ 
          error: 'POLYGON_API_KEY not configured',
          mock: true,
          message: 'Using simulated data - configure Polygon API key for real market data'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get_websocket_url') {
      // Return the WebSocket URL for direct client connection
      // Note: In production, you'd want to proxy this through your backend
      console.log('📡 Returning Polygon WebSocket configuration');
      return new Response(
        JSON.stringify({
          wsUrl: `wss://socket.polygon.io/stocks`,
          authMessage: { action: 'auth', params: POLYGON_API_KEY },
          subscribeFormat: (symbols: string[]) => ({
            action: 'subscribe',
            params: symbols.map(s => `T.${s}`).join(',') // Trades
          }),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get_quotes') {
      // Fetch snapshot quotes from Polygon REST API
      console.log('📊 Fetching quotes for:', symbols);
      
      const quotes = await Promise.all(
        symbols.map(async (symbol: string) => {
          try {
            // Get previous day's data for price info
            const prevResponse = await fetch(
              `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
            );
            const prevData = await prevResponse.json();
            
            // Get snapshot for current bid/ask
            const snapResponse = await fetch(
              `https://api.polygon.io/v3/snapshot?ticker.any_of=${symbol}&apiKey=${POLYGON_API_KEY}`
            );
            const snapData = await snapResponse.json();
            
            const prev = prevData.results?.[0];
            const snap = snapData.results?.[0]?.session;
            
            if (prev) {
              return {
                symbol,
                price: snap?.close || prev.c,
                open: snap?.open || prev.o,
                high: snap?.high || prev.h,
                low: snap?.low || prev.l,
                close: prev.c,
                volume: snap?.volume || prev.v,
                change: (snap?.close || prev.c) - prev.c,
                changePercent: ((snap?.close || prev.c) - prev.c) / prev.c * 100,
                bid: snap?.close ? snap.close - 0.01 : prev.c - 0.01,
                ask: snap?.close ? snap.close + 0.01 : prev.c + 0.01,
                timestamp: new Date().toISOString(),
                source: 'polygon',
              };
            }
            
            return { symbol, error: 'No data available', source: 'polygon' };
          } catch (err) {
            console.error(`Error fetching ${symbol}:`, err);
            return { symbol, error: err.message, source: 'polygon' };
          }
        })
      );
      
      console.log('✅ Fetched quotes:', quotes.length);
      return new Response(
        JSON.stringify({ quotes, source: 'polygon' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in market-data-stream:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
