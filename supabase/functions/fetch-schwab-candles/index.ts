import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parallel data fetching - race between Schwab and Polygon for lowest latency
async function fetchWithRace(
  schwabPromise: Promise<{ data: any[]; source: string } | null>,
  polygonPromise: Promise<{ data: any[]; source: string } | null>,
  timeout: number = 5000
): Promise<{ data: any[]; source: string; racingSource?: string }> {
  const timeoutPromise = new Promise<null>((resolve) => 
    setTimeout(() => resolve(null), timeout)
  );

  try {
    // Race both data sources - first successful response wins
    const result = await Promise.race([
      schwabPromise.then(r => r ? { ...r, winner: 'schwab' } : null),
      polygonPromise.then(r => r ? { ...r, winner: 'polygon' } : null),
      timeoutPromise.then(() => ({ data: [], source: 'timeout', winner: 'none' }))
    ]);

    if (result && result.data && result.data.length > 0) {
      console.log(`🏁 Race winner: ${result.winner} with ${result.data.length} candles`);
      return { data: result.data, source: result.source, racingSource: result.winner };
    }

    // If race didn't produce results, wait for both to complete and use whichever has data
    const [schwabResult, polygonResult] = await Promise.allSettled([schwabPromise, polygonPromise]);
    
    if (schwabResult.status === 'fulfilled' && schwabResult.value?.data?.length) {
      return { data: schwabResult.value.data, source: 'schwab', racingSource: 'schwab-fallback' };
    }
    if (polygonResult.status === 'fulfilled' && polygonResult.value?.data?.length) {
      return { data: polygonResult.value.data, source: 'polygon', racingSource: 'polygon-fallback' };
    }

    return { data: [], source: 'none' };
  } catch (error) {
    console.error('Race error:', error);
    return { data: [], source: 'error' };
  }
}

const getIntervalMinutes = (interval: string): number | null => {
  const normalized = String(interval).toLowerCase();
  const intervalMap: Record<string, number> = {
    '1': 1, '1m': 1, 'minute': 1,
    '5': 5, '5m': 5, '5minute': 5,
    '15': 15, '15m': 15, '15minute': 15,
    '30': 30, '30m': 30, '30minute': 30,
    '60': 60, '1h': 60, 'hour': 60,
  };

  return intervalMap[normalized] ?? null;
};

const getEasternParts = (timestampSeconds: number) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(timestampSeconds * 1000));

  const getPart = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';

  return {
    dateKey: `${getPart('year')}-${getPart('month')}-${getPart('day')}`,
    minutes: Number(getPart('hour')) * 60 + Number(getPart('minute')),
  };
};

const getLatestSessionCoverage = (candles: any[]) => {
  if (!Array.isArray(candles) || candles.length === 0) return null;

  let latestDateKey = '';
  let earliestMinutes = Number.POSITIVE_INFINITY;

  for (const candle of candles) {
    if (!candle?.time) continue;
    const { dateKey, minutes } = getEasternParts(candle.time);

    if (dateKey > latestDateKey) {
      latestDateKey = dateKey;
      earliestMinutes = minutes;
      continue;
    }

    if (dateKey === latestDateKey && minutes < earliestMinutes) {
      earliestMinutes = minutes;
    }
  }

  if (!latestDateKey || !Number.isFinite(earliestMinutes)) return null;

  return { latestDateKey, earliestMinutes };
};

const hasStrongPremarketCoverage = (candles: any[], interval: string): boolean => {
  const intervalMinutes = getIntervalMinutes(interval);
  const coverage = getLatestSessionCoverage(candles);

  if (!intervalMinutes || !coverage) return false;

  const premarketOpenMinutes = 4 * 60;
  const toleratedDelay = Math.max(intervalMinutes, 15);

  return coverage.earliestMinutes <= premarketOpenMinutes + toleratedDelay;
};

const hasEarlierPremarketCoverage = (candidateCandles: any[], baselineCandles: any[]): boolean => {
  const candidateCoverage = getLatestSessionCoverage(candidateCandles);
  const baselineCoverage = getLatestSessionCoverage(baselineCandles);

  if (!candidateCoverage) return false;
  if (!baselineCoverage) return true;
  if (candidateCoverage.latestDateKey > baselineCoverage.latestDateKey) return true;
  if (candidateCoverage.latestDateKey < baselineCoverage.latestDateKey) return false;

  return candidateCoverage.earliestMinutes < baselineCoverage.earliestMinutes;
};

// Fetch from Schwab API
async function fetchFromSchwab(
  symbol: string,
  interval: string,
  accessToken: string,
  startDate?: string,
  endDate?: string,
  premarket?: boolean
): Promise<{ data: any[]; source: string } | null> {
  try {
    const intervalMap: Record<string, { periodType: string; frequencyType: string; frequency: number; period?: number }> = {
      '1': { periodType: 'day', frequencyType: 'minute', frequency: 1, period: 5 },
      '5': { periodType: 'day', frequencyType: 'minute', frequency: 5, period: 10 },
      '15': { periodType: 'day', frequencyType: 'minute', frequency: 15, period: 10 },
      '30': { periodType: 'day', frequencyType: 'minute', frequency: 30, period: 10 },
      '60': { periodType: 'month', frequencyType: 'minute', frequency: 30, period: 6 }, // Schwab doesn't support 60-min, use 30-min with 6 months
      '1m': { periodType: 'day', frequencyType: 'minute', frequency: 1, period: 5 },
      '5m': { periodType: 'day', frequencyType: 'minute', frequency: 5, period: 10 },
      'minute': { periodType: 'day', frequencyType: 'minute', frequency: 1, period: 5 },
      '5minute': { periodType: 'day', frequencyType: 'minute', frequency: 5, period: 10 },
      '15minute': { periodType: 'day', frequencyType: 'minute', frequency: 15, period: 10 },
      '30minute': { periodType: 'day', frequencyType: 'minute', frequency: 30, period: 10 },
      'hour': { periodType: 'month', frequencyType: 'minute', frequency: 30, period: 6 }, // Schwab doesn't support 60-min, use 30-min
      '15m': { periodType: 'day', frequencyType: 'minute', frequency: 15, period: 10 },
      '30m': { periodType: 'day', frequencyType: 'minute', frequency: 30, period: 10 },
      '1h': { periodType: 'month', frequencyType: 'minute', frequency: 30, period: 6 }, // Schwab doesn't support 60-min, use 30-min
      'D': { periodType: 'year', frequencyType: 'daily', frequency: 1, period: 2 },
      '1D': { periodType: 'year', frequencyType: 'daily', frequency: 1, period: 2 },
      'daily': { periodType: 'year', frequencyType: 'daily', frequency: 1, period: 2 },
      'W': { periodType: 'year', frequencyType: 'weekly', frequency: 1, period: 5 },
      '1W': { periodType: 'year', frequencyType: 'weekly', frequency: 1, period: 5 },
      'weekly': { periodType: 'year', frequencyType: 'weekly', frequency: 1, period: 5 },
      'M': { periodType: 'year', frequencyType: 'monthly', frequency: 1, period: 20 },
      '1M': { periodType: 'year', frequencyType: 'monthly', frequency: 1, period: 20 },
      'monthly': { periodType: 'year', frequencyType: 'monthly', frequency: 1, period: 20 },
    };

    const config = intervalMap[interval] || intervalMap['daily'];
    
    const schwabUrl = new URL(`https://api.schwabapi.com/marketdata/v1/pricehistory`);
    schwabUrl.searchParams.append('symbol', symbol);
    schwabUrl.searchParams.append('frequencyType', config.frequencyType);
    schwabUrl.searchParams.append('frequency', config.frequency.toString());
    schwabUrl.searchParams.append('needExtendedHoursData', premarket ? 'true' : 'false');

    if (startDate && endDate) {
      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime();
      schwabUrl.searchParams.append('startDate', startMs.toString());
      schwabUrl.searchParams.append('endDate', endMs.toString());
    } else {
      schwabUrl.searchParams.append('periodType', config.periodType);
      if (config.period) {
        schwabUrl.searchParams.append('period', config.period.toString());
      }
    }

    console.log(`🔵 Schwab fetch started... premarket=${premarket}, needExtendedHoursData=${premarket ? 'true' : 'false'}`);
    const startTime = Date.now();
    
    const schwabResponse = await fetch(schwabUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (schwabResponse.ok) {
      const schwabData = await schwabResponse.json();
      const candles = schwabData.candles?.map((candle: any) => ({
        time: Math.floor(candle.datetime / 1000),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0,
      })) || [];

      console.log(`✅ Schwab returned ${candles.length} candles in ${Date.now() - startTime}ms`);
      return { data: candles, source: 'schwab' };
    } else {
      console.error('Schwab API error:', schwabResponse.status);
      return null;
    }
  } catch (error) {
    console.error('Schwab fetch error:', error);
    return null;
  }
}

// Fetch from Polygon API
async function fetchFromPolygon(
  symbol: string,
  interval: string,
  apiKey: string,
  startDate?: string,
  endDate?: string,
  premarket?: boolean
): Promise<{ data: any[]; source: string } | null> {
  try {
    const polygonIntervalMap: Record<string, { multiplier: number; timespan: string }> = {
      '1': { multiplier: 1, timespan: 'minute' },
      '5': { multiplier: 5, timespan: 'minute' },
      '15': { multiplier: 15, timespan: 'minute' },
      '30': { multiplier: 30, timespan: 'minute' },
      '60': { multiplier: 1, timespan: 'hour' },
      '1m': { multiplier: 1, timespan: 'minute' },
      '5m': { multiplier: 5, timespan: 'minute' },
      '15m': { multiplier: 15, timespan: 'minute' },
      '30m': { multiplier: 30, timespan: 'minute' },
      '1h': { multiplier: 1, timespan: 'hour' },
      'minute': { multiplier: 1, timespan: 'minute' },
      '5minute': { multiplier: 5, timespan: 'minute' },
      '15minute': { multiplier: 15, timespan: 'minute' },
      '30minute': { multiplier: 30, timespan: 'minute' },
      'hour': { multiplier: 1, timespan: 'hour' },
      'daily': { multiplier: 1, timespan: 'day' },
      'D': { multiplier: 1, timespan: 'day' },
      '1D': { multiplier: 1, timespan: 'day' },
      'W': { multiplier: 1, timespan: 'week' },
      '1W': { multiplier: 1, timespan: 'week' },
      'weekly': { multiplier: 1, timespan: 'week' },
      'M': { multiplier: 1, timespan: 'month' },
      '1M': { multiplier: 1, timespan: 'month' },
      'monthly': { multiplier: 1, timespan: 'month' },
    };
    
    const polyConfig = polygonIntervalMap[interval] || { multiplier: 5, timespan: 'minute' };
    
    let fromDate = startDate;
    let toDate = endDate;
    
    if (!fromDate || !toDate) {
      const now = new Date();
      // Use tomorrow as end date to ensure we capture all of today's extended hours
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      toDate = tomorrow.toISOString().split('T')[0];
      
      if (polyConfig.timespan === 'minute') {
        const from = new Date(now);
        // When extended hours enabled, go back fewer days but ensure we capture full pre-market (4AM ET)
        from.setDate(from.getDate() - (premarket ? 7 : 14));
        fromDate = from.toISOString().split('T')[0];
      } else if (polyConfig.timespan === 'hour') {
        const from = new Date(now);
        from.setMonth(from.getMonth() - 6);
        fromDate = from.toISOString().split('T')[0];
      } else if (polyConfig.timespan === 'day') {
        const from = new Date(now);
        from.setFullYear(from.getFullYear() - 2);
        fromDate = from.toISOString().split('T')[0];
      } else {
        const from = new Date(now);
        from.setFullYear(from.getFullYear() - 5);
        fromDate = from.toISOString().split('T')[0];
      }
    }
    
    const polygonUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${polyConfig.multiplier}/${polyConfig.timespan}/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;
    
    console.log('🟣 Polygon fetch started...');
    const startTime = Date.now();
    
    const polygonResponse = await fetch(polygonUrl);
    
    if (polygonResponse.status === 429) {
      console.log('Polygon rate limited, retrying...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      const retryResponse = await fetch(polygonUrl);
      if (retryResponse.ok) {
        const polygonData = await retryResponse.json();
        if (polygonData.results && polygonData.results.length > 0) {
          const candles = polygonData.results.map((bar: any) => ({
            time: Math.floor(bar.t / 1000),
            open: bar.o,
            high: bar.h,
            low: bar.l,
            close: bar.c,
            volume: bar.v || 0,
          }));
          console.log(`✅ Polygon (retry) returned ${candles.length} candles in ${Date.now() - startTime}ms`);
          return { data: candles, source: 'polygon' };
        }
      }
      return null;
    }
    
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
        
        console.log(`✅ Polygon returned ${candles.length} candles in ${Date.now() - startTime}ms`);
        return { data: candles, source: 'polygon' };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Polygon fetch error:', error);
    return null;
  }
}

// Fetch from Alpha Vantage API (fallback)
async function fetchFromAlphaVantage(
  symbol: string,
  interval: string,
  apiKey: string,
  startDate?: string,
  endDate?: string
): Promise<{ data: any[]; source: string } | null> {
  try {
    let functionType = 'TIME_SERIES_INTRADAY';
    if (['D', '1D', 'daily'].includes(interval)) {
      functionType = 'TIME_SERIES_DAILY';
    } else if (['W', '1W', 'weekly'].includes(interval)) {
      functionType = 'TIME_SERIES_WEEKLY';
    } else if (['M', '1M', 'monthly'].includes(interval)) {
      functionType = 'TIME_SERIES_MONTHLY';
    }
    
    let avUrl = `https://www.alphavantage.co/query?function=${functionType}&symbol=${symbol}&apikey=${apiKey}&outputsize=full`;
    
    if (functionType === 'TIME_SERIES_INTRADAY') {
      const avIntervalMap: Record<string, string> = {
        '1': '1min', '5': '5min', '15': '15min', '30': '30min', '60': '60min',
        '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '60min',
        'minute': '1min', '5minute': '5min', '15minute': '15min', '30minute': '30min', 'hour': '60min',
      };
      avUrl += `&interval=${avIntervalMap[interval] || '5min'}`;
    }
    
    console.log('🟡 Alpha Vantage fetch started...');
    const avResponse = await fetch(avUrl);
    
    if (avResponse.ok) {
      const avData = await avResponse.json();
      
      if (avData['Error Message'] || avData['Note']) {
        console.log('Alpha Vantage limit/error:', avData['Note'] || avData['Error Message']);
        return null;
      }
      
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
          console.log(`✅ Alpha Vantage returned ${candles.length} candles`);
          return { data: candles, source: 'alphavantage' };
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Alpha Vantage fetch error:', error);
    return null;
  }
}

// Generate mock data as last resort
function generateMockData(
  symbol: string,
  interval: string,
  basePrice: number,
  premarket: boolean
): { data: any[]; source: string; note: string } {
  const intervalMs: Record<string, number> = {
    '1': 60 * 1000, '5': 5 * 60 * 1000, '15': 15 * 60 * 1000, '30': 30 * 60 * 1000,
    '60': 60 * 60 * 1000, '1m': 60 * 1000, '5m': 5 * 60 * 1000, '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000, '1h': 60 * 60 * 1000, 'minute': 60 * 1000, '5minute': 5 * 60 * 1000,
    '15minute': 15 * 60 * 1000, '30minute': 30 * 60 * 1000, 'hour': 60 * 60 * 1000,
    'D': 24 * 60 * 60 * 1000, '1D': 24 * 60 * 60 * 1000, 'daily': 24 * 60 * 60 * 1000,
    'W': 7 * 24 * 60 * 60 * 1000, '1W': 7 * 24 * 60 * 60 * 1000, 'weekly': 7 * 24 * 60 * 60 * 1000,
    'M': 30 * 24 * 60 * 60 * 1000, '1M': 30 * 24 * 60 * 60 * 1000, 'monthly': 30 * 24 * 60 * 60 * 1000,
  };
  
  const candleInterval = intervalMs[interval] || 60 * 1000;
  const isIntraday = candleInterval < 24 * 60 * 60 * 1000;
  const isHourly = candleInterval === 60 * 60 * 1000;
  
  let numCandles: number;
  if (isIntraday && !isHourly) {
    const candlesPerTradingDay = premarket ? 
      Math.floor(10 * 60 * 60 * 1000 / candleInterval) :
      Math.floor(6.5 * 60 * 60 * 1000 / candleInterval);
    numCandles = Math.min(candlesPerTradingDay * 10, 5000);
  } else if (isHourly) {
    numCandles = Math.min(24 * 30 * 6, 4320);
  } else if (candleInterval === 24 * 60 * 60 * 1000) {
    numCandles = 504;
  } else if (candleInterval === 7 * 24 * 60 * 60 * 1000) {
    numCandles = 260;
  } else {
    numCandles = 120;
  }
  
  const now = Date.now();
  const currentCandleStart = Math.floor(now / candleInterval) * candleInterval;
  const mockCandles = [];
  let currentPrice = basePrice;
  
  for (let i = numCandles; i >= 0; i--) {
    const candleTime = currentCandleStart - (i * candleInterval);
    const candleDate = new Date(candleTime);
    
    if (isIntraday) {
      const day = candleDate.getDay();
      if (day === 0 || day === 6) continue;
      
      const etTime = new Date(candleDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const hour = etTime.getHours();
      const minute = etTime.getMinutes();
      const timeInMinutes = hour * 60 + minute;
      
      const premarketStart = 4 * 60;
      const marketOpen = 9 * 60 + 30;
      const marketClose = 16 * 60;
      const afterHoursEnd = 20 * 60;
      
      if (premarket) {
        if (timeInMinutes < premarketStart || timeInMinutes >= afterHoursEnd) continue;
      } else {
        if (timeInMinutes < marketOpen || timeInMinutes >= marketClose) continue;
      }
    }
    
    const time = Math.floor(candleTime / 1000);
    const volatility = basePrice * 0.003;
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
  
  return {
    data: mockCandles,
    source: 'mock',
    note: `Mock data based on current price $${basePrice.toFixed(2)}. Connect Schwab for live data.`,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, interval = '1min', period = 'day', startDate, endDate, premarket = false } = await req.json();

    if (!symbol) {
      throw new Error('Symbol is required');
    }

    console.log(`🚀 Fetching candles for ${symbol} with interval ${interval} (PARALLEL MODE)`);
    const overallStart = Date.now();

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    // Get API keys
    const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
    const alphaVantageKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
    
    // Get Schwab access token (non-blocking)
    let accessToken: string | null = null;
    try {
      const { data: tokenData, error: tokenError } = await supabase.functions.invoke(
        "schwab-get-access-token",
        { headers: { Authorization: authHeader } }
      );
      if (!tokenError && tokenData?.access_token) {
        accessToken = tokenData.access_token;
        console.log('✅ Schwab access token obtained');
      }
    } catch (error) {
      console.log('⚠️ Could not get Schwab access token:', error);
    }

    // PARALLEL FETCH: Start both Schwab and Polygon simultaneously
    const schwabPromise = accessToken 
      ? fetchFromSchwab(symbol, interval, accessToken, startDate, endDate, premarket)
      : Promise.resolve(null);
    
    const polygonPromise = polygonApiKey
      ? fetchFromPolygon(symbol, interval, polygonApiKey, startDate, endDate, premarket)
      : Promise.resolve(null);

    // When extended hours is on, prefer Schwab since it natively supports needExtendedHoursData
    // Polygon aggregates include extended hours trades but may have delays on free tier
    let raceResult;
    if (premarket && accessToken) {
      console.log('⏰ Extended hours ON — prioritizing Schwab for pre/post market data');
      // Give Schwab priority: wait for it first, fall back to Polygon
      const schwabResult = await schwabPromise;
      if (schwabResult && schwabResult.data.length > 0) {
        raceResult = { data: schwabResult.data, source: schwabResult.source, racingSource: 'schwab-priority' };
      } else {
        // Schwab failed, try Polygon
        const polygonResult = await polygonPromise;
        if (polygonResult && polygonResult.data.length > 0) {
          raceResult = { data: polygonResult.data, source: polygonResult.source, racingSource: 'polygon-fallback' };
        } else {
          raceResult = { data: [], source: 'none' };
        }
      }
    } else {
      // Regular hours: race both sources
      raceResult = await fetchWithRace(schwabPromise, polygonPromise);
    }
    
    if (raceResult.data.length > 0) {
      console.log(`🏆 Parallel fetch complete in ${Date.now() - overallStart}ms (winner: ${raceResult.racingSource})`);
      return new Response(
        JSON.stringify({ 
          data: raceResult.data,
          source: raceResult.source,
          symbol,
          latency: Date.now() - overallStart,
          fetchMode: 'parallel-race',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fallback to Alpha Vantage if parallel fetch failed
    if (alphaVantageKey) {
      const avResult = await fetchFromAlphaVantage(symbol, interval, alphaVantageKey, startDate, endDate);
      if (avResult && avResult.data.length > 0) {
        console.log(`📊 Alpha Vantage fallback complete in ${Date.now() - overallStart}ms`);
        return new Response(
          JSON.stringify({ 
            data: avResult.data,
            source: 'alphavantage',
            symbol,
            latency: Date.now() - overallStart,
            fetchMode: 'fallback',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // All real data sources failed, generate mock data
    console.log('⚠️ All data sources failed, generating mock data...');
    
    let basePrice = 150;
    
    // Try to get accurate current price for mock data
    if (polygonApiKey) {
      try {
        await new Promise(resolve => setTimeout(resolve, 500));
        const prevResponse = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${polygonApiKey}`
        );
        if (prevResponse.ok) {
          const prevData = await prevResponse.json();
          if (prevData.results?.[0]?.c) {
            basePrice = prevData.results[0].c;
            console.log(`Got base price from Polygon: $${basePrice}`);
          }
        }
      } catch (e) {
        console.log('Could not fetch current price from Polygon');
      }
    }
    
    const fmpKey = Deno.env.get('FMP_API_KEY');
    if (fmpKey && basePrice === 150) {
      try {
        const fmpResponse = await fetch(
          `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${fmpKey}`
        );
        if (fmpResponse.ok) {
          const fmpData = await fmpResponse.json();
          if (fmpData?.[0]?.price) {
            basePrice = fmpData[0].price;
            console.log(`Got base price from FMP: $${basePrice}`);
          }
        }
      } catch (e) {
        console.log('Could not fetch current price from FMP');
      }
    }
    
    const mockResult = generateMockData(symbol, interval, basePrice, premarket);
    
    console.log(`📊 Mock data generated in ${Date.now() - overallStart}ms`);
    return new Response(
      JSON.stringify({ 
        data: mockResult.data,
        source: mockResult.source,
        symbol,
        note: mockResult.note,
        latency: Date.now() - overallStart,
        fetchMode: 'mock',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-schwab-candles:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
