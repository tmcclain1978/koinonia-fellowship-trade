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
    const { symbol, limit = 20 } = await req.json();
    
    if (!symbol) {
      return new Response(
        JSON.stringify({ error: 'Symbol is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FMP_API_KEY = Deno.env.get('FMP_API_KEY');
    if (!FMP_API_KEY) {
      throw new Error('FMP_API_KEY not configured');
    }

    console.log('Fetching news for:', symbol);

    const url = `https://financialmodelingprep.com/api/v3/stock_news?tickers=${symbol.toUpperCase()}&limit=${limit}&apikey=${FMP_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('FMP API error:', response.status, errorText);
      throw new Error(`FMP API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('News articles received:', data?.length || 0);

    // Transform the data
    const transformedNews = (data || []).map((article: any) => ({
      title: article.title,
      url: article.url,
      publishedDate: article.publishedDate,
      site: article.site,
      text: article.text,
      symbol: article.symbol,
    }));

    return new Response(
      JSON.stringify({ 
        success: true, 
        news: transformedNews 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error in fetch-market-news function:', error);
    return new Response(
      JSON.stringify({ error: (error as any).message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
