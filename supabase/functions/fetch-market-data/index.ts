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
    const { symbol, interval = '5min', dataType = 'price', indicator = 'SMA', timePeriod = 20 } = await req.json();

    if (!symbol) {
      throw new Error('Symbol is required');
    }

    const apiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
    if (!apiKey) {
      throw new Error('ALPHA_VANTAGE_API_KEY not configured');
    }

    console.log(`Fetching ${dataType} data for ${symbol} with interval ${interval}`);

    let url = '';
    let responseKey = '';

    // Handle different data types
    if (dataType === 'quote') {
      // Real-time quote
      url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;
      responseKey = 'Global Quote';
    } else if (dataType === 'indicator') {
      // Technical indicators (RSI, MACD, SMA, EMA, BBANDS, VWAP, etc.)
      const indicatorMap: Record<string, string> = {
        'SMA': 'SMA',
        'EMA': 'EMA',
        'RSI': 'RSI',
        'MACD': 'MACD',
        'BBANDS': 'BBANDS',
        'VWAP': 'VWAP',
        'STOCH': 'STOCH',
        'ADX': 'ADX'
      };
      
      const apiIndicator = indicatorMap[indicator] || 'SMA';
      let apiInterval = interval;
      if (!interval.includes('min') && interval !== '1D' && interval !== 'daily') {
        apiInterval = `${interval}min`;
      }
      if (interval === '1D' || interval === 'daily' || interval === 'D') {
        apiInterval = 'daily';
      }
      
      url = `https://www.alphavantage.co/query?function=${apiIndicator}&symbol=${symbol}&interval=${apiInterval}&time_period=${timePeriod}&series_type=close&apikey=${apiKey}`;
      responseKey = `Technical Analysis: ${apiIndicator}`;
    } else {
      // Price data (intraday, daily, or daily_adjusted)
      let apiInterval = interval;
      if (!interval.includes('min') && interval !== '1D' && interval !== 'daily') {
        apiInterval = `${interval}min`;
      }

      let apiFunction = 'TIME_SERIES_INTRADAY';
      let intervalParam = `&interval=${apiInterval}`;
      
      if (interval === '1D' || interval === 'daily' || interval === 'D') {
        apiFunction = dataType === 'daily_adjusted' ? 'TIME_SERIES_DAILY_ADJUSTED' : 'TIME_SERIES_DAILY';
        intervalParam = '';
      }

      url = `https://www.alphavantage.co/query?function=${apiFunction}&symbol=${symbol}${intervalParam}&apikey=${apiKey}&outputsize=compact`;
      
      if (interval === '1D' || interval === 'daily' || interval === 'D') {
        responseKey = dataType === 'daily_adjusted' ? 'Time Series (Daily)' : 'Time Series (Daily)';
      } else {
        responseKey = `Time Series (${apiInterval})`;
      }
    }

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

    // Handle different response formats
    let chartData: any[] = [];
    let lastRefreshed = new Date().toISOString();

    if (dataType === 'quote') {
      // Parse global quote response
      const quote = data['Global Quote'];
      if (!quote) {
        throw new Error('Quote data not found');
      }
      
      // Return single data point for current quote
      chartData = [{
        time: Math.floor(new Date().getTime() / 1000),
        open: parseFloat(quote['02. open']),
        high: parseFloat(quote['03. high']),
        low: parseFloat(quote['04. low']),
        close: parseFloat(quote['05. price']),
        volume: parseInt(quote['06. volume']),
      }];
      lastRefreshed = quote['07. latest trading day'];
      
    } else if (dataType === 'indicator') {
      // Parse technical indicator response
      const indicatorKey = Object.keys(data).find(key => key.startsWith('Technical Analysis'));
      const indicatorData = data[indicatorKey || ''];
      
      if (!indicatorData) {
        console.error('Available keys:', Object.keys(data));
        throw new Error('Indicator data not found');
      }

      // Convert indicator data to time series format
      chartData = Object.entries(indicatorData)
        .map(([timestamp, values]: [string, any]) => {
          const entry: any = {
            time: Math.floor(new Date(timestamp).getTime() / 1000),
          };
          
          // Handle different indicator formats
          if (indicator === 'BBANDS') {
            entry.upper = parseFloat(values['Real Upper Band']);
            entry.middle = parseFloat(values['Real Middle Band']);
            entry.lower = parseFloat(values['Real Lower Band']);
          } else if (indicator === 'MACD') {
            entry.macd = parseFloat(values['MACD']);
            entry.signal = parseFloat(values['MACD_Signal']);
            entry.histogram = parseFloat(values['MACD_Hist']);
          } else {
            // Single value indicators (SMA, EMA, RSI, etc.)
            const valueKey = Object.keys(values)[0];
            entry.value = parseFloat(values[valueKey]);
          }
          
          return entry;
        })
        .sort((a, b) => a.time - b.time);
      
      lastRefreshed = data['Meta Data']?.['3: Last Refreshed'] || new Date().toISOString();
      
    } else {
      // Parse price time series data
      const timeSeries = data[responseKey];
      if (!timeSeries) {
        console.error('Available keys:', Object.keys(data));
        throw new Error(`Time series data not found. Expected key: ${responseKey}`);
      }

      // Convert to our chart format
      chartData = Object.entries(timeSeries)
        .map(([timestamp, values]: [string, any]) => ({
          time: Math.floor(new Date(timestamp).getTime() / 1000),
          open: parseFloat(values['1. open']),
          high: parseFloat(values['2. high']),
          low: parseFloat(values['3. low']),
          close: parseFloat(values['4. close']),
          volume: parseInt(values['5. volume']),
          // Include adjusted values if available
          ...(values['5. adjusted close'] && {
            adjustedClose: parseFloat(values['5. adjusted close']),
            dividendAmount: parseFloat(values['7. dividend amount']),
            splitCoefficient: parseFloat(values['8. split coefficient']),
          }),
        }))
        .sort((a, b) => a.time - b.time);

      lastRefreshed = data['Meta Data']?.['3. Last Refreshed'] || new Date().toISOString();
    }

    console.log(`Successfully fetched ${chartData.length} data points for ${symbol}`);

    return new Response(
      JSON.stringify({
        symbol,
        interval,
        dataType,
        indicator: dataType === 'indicator' ? indicator : undefined,
        data: chartData,
        lastRefreshed,
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
