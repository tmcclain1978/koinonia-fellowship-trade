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
    const { symbol, interval = '5min' } = await req.json();

    if (!symbol) {
      throw new Error('Symbol is required');
    }

    const apiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
    if (!apiKey) {
      throw new Error('ALPHA_VANTAGE_API_KEY not configured');
    }

    console.log(`Fetching market data for ${symbol} with interval ${interval}`);

    // Convert interval to Alpha Vantage format
    let apiInterval = interval;
    if (!interval.includes('min') && interval !== '1D' && interval !== 'daily') {
      // Convert numeric intervals to Alpha Vantage format (5 -> 5min)
      apiInterval = `${interval}min`;
    }

    // Determine which Alpha Vantage function to use
    let apiFunction = 'TIME_SERIES_INTRADAY';
    let intervalParam = `&interval=${apiInterval}`;
    
    if (interval === '1D' || interval === 'daily' || interval === 'D') {
      apiFunction = 'TIME_SERIES_DAILY';
      intervalParam = '';
    }

    const url = `https://www.alphavantage.co/query?function=${apiFunction}&symbol=${symbol}${intervalParam}&apikey=${apiKey}&outputsize=compact`;

    const response = await fetch(url);
    const data = await response.json();

    console.log('Alpha Vantage API response keys:', Object.keys(data));

    // Check for API errors or informational messages
    if (data['Error Message']) {
      throw new Error(data['Error Message']);
    }

    if (data['Note']) {
      throw new Error('API rate limit reached. Alpha Vantage free tier allows 25 requests per day.');
    }

    if (data['Information']) {
      console.error('Alpha Vantage Information:', data['Information']);
      throw new Error(data['Information']);
    }

    // Parse the time series data
    let timeSeriesKey = '';
    if (interval === '1D' || interval === 'daily' || interval === 'D') {
      timeSeriesKey = 'Time Series (Daily)';
    } else {
      timeSeriesKey = `Time Series (${apiInterval})`;
    }

    const timeSeries = data[timeSeriesKey];
    if (!timeSeries) {
      console.error('Available keys:', Object.keys(data));
      throw new Error(`Time series data not found for interval ${interval}`);
    }

    // Convert to our chart format
    const chartData = Object.entries(timeSeries)
      .map(([timestamp, values]: [string, any]) => ({
        time: Math.floor(new Date(timestamp).getTime() / 1000),
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume']),
      }))
      .sort((a, b) => a.time - b.time); // Sort by time ascending

    console.log(`Successfully fetched ${chartData.length} data points for ${symbol}`);

    return new Response(
      JSON.stringify({
        symbol,
        interval,
        data: chartData,
        lastRefreshed: data['Meta Data']?.['3. Last Refreshed'] || new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error fetching market data:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
