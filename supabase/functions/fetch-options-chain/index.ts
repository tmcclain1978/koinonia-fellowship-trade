import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, strikePrice, expirationDate, contractType } = await req.json();
    
    if (!symbol) {
      return new Response(
        JSON.stringify({ error: 'Symbol is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const POLYGON_API_KEY = Deno.env.get('POLYGON_API_KEY');
    if (!POLYGON_API_KEY) {
      throw new Error('POLYGON_API_KEY not configured');
    }

    console.log('Fetching options chain for:', symbol);

    // Build query parameters
    const params = new URLSearchParams({
      apiKey: POLYGON_API_KEY,
    });
    
    if (strikePrice) params.append('strike_price', strikePrice.toString());
    if (expirationDate) params.append('expiration_date', expirationDate);
    if (contractType) params.append('contract_type', contractType);

    const url = `https://api.polygon.io/v3/snapshot/options/${symbol.toUpperCase()}?${params.toString()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Polygon API error:', response.status, errorText);
      throw new Error(`Polygon API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Options chain data received:', data.results?.length || 0, 'contracts');

    // Transform the data to match our UI format
    const transformedResults = (data.results || []).map((contract: any) => ({
      strike: contract.details?.strike_price,
      contractType: contract.details?.contract_type,
      expiration: contract.details?.expiration_date,
      delta: contract.greeks?.delta,
      gamma: contract.greeks?.gamma,
      theta: contract.greeks?.theta,
      vega: contract.greeks?.vega,
      impliedVolatility: contract.implied_volatility,
      bid: contract.last_quote?.bid,
      ask: contract.last_quote?.ask,
      lastPrice: contract.last_trade?.price,
      volume: contract.day?.volume,
      openInterest: contract.open_interest,
      breakEven: contract.break_even_price,
    }));

    return new Response(
      JSON.stringify({ 
        success: true, 
        symbol: data.underlying_asset?.ticker,
        results: transformedResults 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error in fetch-options-chain function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
