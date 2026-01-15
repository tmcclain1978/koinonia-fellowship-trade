import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScreenerCondition {
  id: string;
  type: string;
  operator: string;
  value: number;
}

interface StockData {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  relativeVolume: number;
  high52w: number;
  low52w: number;
  marketCap: number;
  // Technical indicators (calculated)
  rsi?: number;
  sma20?: number;
  sma50?: number;
  atr?: number;
  atrPercent?: number;
}

interface ScreenerResult {
  symbol: string;
  price: number;
  change_percent: number;
  volume: number;
  match_score: number;
  matched_conditions: string[];
  data: StockData;
}

// Popular stocks for screening
const DEFAULT_UNIVERSE = [
  // Mega caps
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B", "JPM", "V",
  // Tech
  "AMD", "INTC", "CRM", "ORCL", "ADBE", "NFLX", "PYPL", "SQ", "SHOP", "SNOW",
  // Consumer
  "DIS", "NKE", "SBUX", "MCD", "KO", "PEP", "WMT", "COST", "TGT", "HD",
  // Finance
  "BAC", "GS", "MS", "C", "WFC", "AXP", "BLK", "SCHW", "USB", "PNC",
  // Healthcare
  "JNJ", "UNH", "PFE", "ABBV", "MRK", "LLY", "TMO", "ABT", "DHR", "BMY",
  // Energy
  "XOM", "CVX", "COP", "SLB", "EOG", "MPC", "VLO", "PSX", "OXY", "DVN",
  // ETFs
  "SPY", "QQQ", "IWM", "DIA", "XLF", "XLE", "XLK", "XLV", "XLI", "XLY"
];

// Calculate RSI from price history
function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate SMA
function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[0] || 0;
  const slice = prices.slice(0, period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Calculate ATR
function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < period + 1) return 0;
  
  let atrSum = 0;
  for (let i = 1; i <= period; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    atrSum += tr;
  }
  return atrSum / period;
}

// Check if stock matches a condition
function matchesCondition(data: StockData, condition: ScreenerCondition): boolean {
  const { type, value } = condition;
  
  switch (type) {
    case "price_above":
      return data.price > value;
    case "price_below":
      return data.price < value;
    case "price_change_above":
      return data.changePercent > value;
    case "price_change_below":
      return data.changePercent < value;
    case "volume_above":
      return data.volume > value;
    case "volume_spike":
      return data.relativeVolume > value;
    case "relative_volume":
      return data.relativeVolume > value;
    case "rsi_above":
      return (data.rsi || 50) > value;
    case "rsi_below":
      return (data.rsi || 50) < value;
    case "sma_above":
      // Price above SMA period
      if (value === 20 && data.sma20) return data.price > data.sma20;
      if (value === 50 && data.sma50) return data.price > data.sma50;
      return true;
    case "sma_below":
      if (value === 20 && data.sma20) return data.price < data.sma20;
      if (value === 50 && data.sma50) return data.price < data.sma50;
      return true;
    case "52w_high_near":
      const distFromHigh = ((data.high52w - data.price) / data.high52w) * 100;
      return distFromHigh <= value;
    case "52w_low_near":
      const distFromLow = ((data.price - data.low52w) / data.low52w) * 100;
      return distFromLow <= value;
    case "gap_up":
      const gapUp = ((data.open - data.prevClose) / data.prevClose) * 100;
      return gapUp >= value;
    case "gap_down":
      const gapDown = ((data.prevClose - data.open) / data.prevClose) * 100;
      return gapDown >= value;
    case "atr_percent":
      return (data.atrPercent || 0) > value;
    case "market_cap_above":
      return data.marketCap > value * 1e9; // Value in billions
    case "market_cap_below":
      return data.marketCap < value * 1e9;
    case "new_high":
      return data.high >= data.high52w * 0.98; // Within 2% of 52w high
    case "new_low":
      return data.low <= data.low52w * 1.02; // Within 2% of 52w low
    case "macd_positive":
    case "macd_crossover":
    case "ema_crossover":
    case "bb_squeeze":
    case "inside_bar":
    case "float_below":
      // These need more complex calculations or additional data
      // Return true to not filter out (not available in current data)
      return true;
    default:
      return true;
  }
}

// Get condition label for matched conditions display
function getConditionLabel(type: string): string {
  const labels: Record<string, string> = {
    "price_above": "Price Above",
    "price_below": "Price Below", 
    "price_change_above": "% Change Up",
    "price_change_below": "% Change Down",
    "volume_above": "High Volume",
    "volume_spike": "Volume Spike",
    "relative_volume": "Rel. Volume",
    "rsi_above": "RSI High",
    "rsi_below": "RSI Low",
    "sma_above": "Above SMA",
    "sma_below": "Below SMA",
    "52w_high_near": "Near 52W High",
    "52w_low_near": "Near 52W Low",
    "gap_up": "Gap Up",
    "gap_down": "Gap Down",
    "atr_percent": "High ATR%",
    "market_cap_above": "Large Cap",
    "market_cap_below": "Small Cap",
    "new_high": "New High",
    "new_low": "New Low",
  };
  return labels[type] || type;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const polygonApiKey = Deno.env.get("POLYGON_API_KEY");
    
    if (!polygonApiKey) {
      console.error("[Stock Screener] POLYGON_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Market data API not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { conditions, customSymbols, quotesOnly } = await req.json();
    
    // For watchlist - just fetch quotes without screening
    if (quotesOnly) {
      const symbols = customSymbols || [];
      console.log(`[Stock Screener] Fetching quotes for ${symbols.length} symbols`);
      
      const results: ScreenerResult[] = [];
      
      for (const symbol of symbols) {
        try {
          const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${polygonApiKey}`;
          const snapshotRes = await fetch(snapshotUrl);
          
          if (!snapshotRes.ok) continue;
          
          const snapshot = await snapshotRes.json();
          const ticker = snapshot.ticker;
          
          if (!ticker?.day) continue;

          const currentPrice = ticker.day?.c || ticker.prevDay?.c || 0;
          const prevClose = ticker.prevDay?.c || currentPrice;
          const change = currentPrice - prevClose;
          const changePercent = prevClose ? (change / prevClose) * 100 : 0;

          results.push({
            symbol,
            price: currentPrice,
            change_percent: changePercent,
            volume: ticker.day?.v || 0,
            match_score: 100,
            matched_conditions: [],
            data: {
              symbol,
              price: currentPrice,
              open: ticker.day?.o || currentPrice,
              high: ticker.day?.h || currentPrice,
              low: ticker.day?.l || currentPrice,
              close: currentPrice,
              prevClose,
              change,
              changePercent,
              volume: ticker.day?.v || 0,
              avgVolume: ticker.prevDay?.v || 0,
              relativeVolume: 1,
              high52w: ticker.max?.high || currentPrice * 1.2,
              low52w: ticker.min?.low || currentPrice * 0.8,
              marketCap: ticker.market_cap || 0,
            },
          });
        } catch (e) {
          console.error(`[Stock Screener] Error fetching quote for ${symbol}:`, e);
        }
      }

      return new Response(
        JSON.stringify({
          results,
          totalScreened: symbols.length,
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!conditions || !Array.isArray(conditions) || conditions.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one screening condition is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const symbols = customSymbols?.length > 0 ? customSymbols : DEFAULT_UNIVERSE;
    console.log(`[Stock Screener] Screening ${symbols.length} symbols with ${conditions.length} conditions`);

    const results: ScreenerResult[] = [];
    
    // Process symbols in batches to respect API rate limits
    const batchSize = 10;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (symbol: string) => {
        try {
          // Fetch snapshot data from Polygon
          const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${polygonApiKey}`;
          const snapshotRes = await fetch(snapshotUrl);
          
          if (!snapshotRes.ok) {
            console.log(`[Stock Screener] No snapshot for ${symbol}: ${snapshotRes.status}`);
            return null;
          }
          
          const snapshot = await snapshotRes.json();
          const ticker = snapshot.ticker;
          
          if (!ticker || !ticker.day) {
            console.log(`[Stock Screener] Incomplete data for ${symbol}`);
            return null;
          }

          // Get historical data for indicators
          const today = new Date();
          const startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 60); // 60 days back
          
          const barsUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate.toISOString().split('T')[0]}/${today.toISOString().split('T')[0]}?adjusted=true&sort=desc&limit=60&apiKey=${polygonApiKey}`;
          
          let historicalData: { c: number[], h: number[], l: number[], o: number[] } = { c: [], h: [], l: [], o: [] };
          
          try {
            const barsRes = await fetch(barsUrl);
            if (barsRes.ok) {
              const bars = await barsRes.json();
              if (bars.results) {
                historicalData = {
                  c: bars.results.map((b: any) => b.c),
                  h: bars.results.map((b: any) => b.h),
                  l: bars.results.map((b: any) => b.l),
                  o: bars.results.map((b: any) => b.o),
                };
              }
            }
          } catch (e) {
            console.log(`[Stock Screener] Could not fetch history for ${symbol}`);
          }

          // Calculate technical indicators
          const rsi = historicalData.c.length > 14 ? calculateRSI(historicalData.c) : undefined;
          const sma20 = historicalData.c.length >= 20 ? calculateSMA(historicalData.c, 20) : undefined;
          const sma50 = historicalData.c.length >= 50 ? calculateSMA(historicalData.c, 50) : undefined;
          const atr = historicalData.h.length > 14 
            ? calculateATR(historicalData.h, historicalData.l, historicalData.c) 
            : undefined;

          const currentPrice = ticker.day?.c || ticker.prevDay?.c || 0;
          const prevClose = ticker.prevDay?.c || currentPrice;
          const change = currentPrice - prevClose;
          const changePercent = prevClose ? (change / prevClose) * 100 : 0;
          
          // Estimate relative volume (current vs average)
          const currentVolume = ticker.day?.v || 0;
          const avgVolume = ticker.prevDay?.v || currentVolume;
          const relativeVolume = avgVolume > 0 ? currentVolume / avgVolume : 1;

          const stockData: StockData = {
            symbol,
            price: currentPrice,
            open: ticker.day?.o || currentPrice,
            high: ticker.day?.h || currentPrice,
            low: ticker.day?.l || currentPrice,
            close: currentPrice,
            prevClose,
            change,
            changePercent,
            volume: currentVolume,
            avgVolume,
            relativeVolume,
            high52w: ticker.max?.high || currentPrice * 1.2,
            low52w: ticker.min?.low || currentPrice * 0.8,
            marketCap: ticker.market_cap || 0,
            rsi,
            sma20,
            sma50,
            atr,
            atrPercent: atr && currentPrice ? (atr / currentPrice) * 100 : undefined,
          };

          // Check all conditions
          const matchedConditions: string[] = [];
          let matchCount = 0;
          
          for (const condition of conditions) {
            if (matchesCondition(stockData, condition)) {
              matchCount++;
              matchedConditions.push(getConditionLabel(condition.type));
            }
          }

          // Calculate match score as percentage of conditions met
          const matchScore = Math.round((matchCount / conditions.length) * 100);

          // Only include if at least one condition matches
          if (matchCount > 0) {
            return {
              symbol,
              price: currentPrice,
              change_percent: changePercent,
              volume: currentVolume,
              match_score: matchScore,
              matched_conditions: matchedConditions,
              data: stockData,
            } as ScreenerResult;
          }
          
          return null;
        } catch (e) {
          console.error(`[Stock Screener] Error processing ${symbol}:`, e);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((r): r is ScreenerResult => r !== null));
      
      // Small delay between batches to respect rate limits
      if (i + batchSize < symbols.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Sort by match score descending, then by volume
    results.sort((a, b) => {
      if (b.match_score !== a.match_score) return b.match_score - a.match_score;
      return b.volume - a.volume;
    });

    console.log(`[Stock Screener] Found ${results.length} matching stocks`);

    return new Response(
      JSON.stringify({
        results,
        totalScreened: symbols.length,
        totalMatches: results.length,
        conditions: conditions.length,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Stock Screener] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
