import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BreakoutCandidate {
  symbol: string;
  companyName: string;
  price: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  relativeVolume: number;
  marketCap: number;
  breakoutScore: number;
  scoreBreakdown: {
    volumeScore: number;
    momentumScore: number;
    rsiScore: number;
    sentimentScore: number;
    marketCapScore: number;
    nearHighScore: number;
    smaScore: number;
  };
  sentiment: {
    overall: string;
    score: number;
    headline?: string;
  } | null;
  technicals: {
    rsi: number;
    sma20: number;
    momentum5d: number;
    nearHigh20d: boolean;
    aboveSma20: boolean;
  };
  catalystFlag: boolean;
}

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

// Calculate 5-day momentum
function calculate5DayMomentum(closes: number[]): number {
  if (closes.length < 6) return 0;
  const current = closes[0];
  const fiveDaysAgo = closes[5];
  return ((current - fiveDaysAgo) / fiveDaysAgo) * 100;
}

// Fallback low-cap stock universe for when FMP screener fails
// Using actively traded stocks under $10 with decent volume
const LOW_CAP_UNIVERSE = [
  // Actively traded low-cap stocks (verified as of 2024-2025)
  "SOUN", "SOFI", "NIO", "PLTR", "HOOD", "SNAP", "PLUG", "LCID", "RIVN", "DKNG",
  "MARA", "RIOT", "AFRM", "UPST", "COIN", "RBLX", "PATH", "IONQ", "SMCI", "ARM",
  "JOBY", "OPEN", "CLSK", "DNA", "WOLF", "PTRA", "CLOV", "SNDL", "TLRY", "BB",
  "CIFR", "BITF", "HUT", "IREN", "BTDR", "WULF", "CORZ", "ARBK", "GREE", "DMYY",
  "LAZR", "LIDR", "OUST", "INVZ", "AEVA", "CPTN", "VLDR", "HSAI", "AUR", "FFIE"
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const polygonApiKey = Deno.env.get("POLYGON_API_KEY");
    const fmpApiKey = Deno.env.get("FMP_API_KEY");
    const alphaVantageKey = Deno.env.get("ALPHA_VANTAGE_API_KEY");
    
    if (!polygonApiKey && !fmpApiKey && !alphaVantageKey) {
      return new Response(
        JSON.stringify({ error: "No API keys configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { maxPrice = 10, minMarketCap = 50, maxMarketCap = 2000, includeSentiment = true } = await req.json().catch(() => ({}));

    console.log("[Breakout Screener] Starting scan with params:", { maxPrice, minMarketCap, maxMarketCap, includeSentiment });

    let candidates: any[] = [];
    let usedFallback = false;

    // Step 1: Try FMP Stock Screener first
    if (fmpApiKey) {
      try {
        const screenerParams = new URLSearchParams({
          priceLowerThan: maxPrice.toString(),
          priceMoreThan: "0.50",
          marketCapMoreThan: (minMarketCap * 1000000).toString(),
          marketCapLowerThan: (maxMarketCap * 1000000).toString(),
          volumeMoreThan: "100000",
          isActivelyTrading: "true",
          isEtf: "false",
          isFund: "false",
          exchange: "NASDAQ,NYSE,AMEX",
          limit: "100",
          apikey: fmpApiKey,
        });
        
        const screenerUrl = `https://financialmodelingprep.com/api/v3/stock-screener?${screenerParams}`;
        console.log("[Breakout Screener] Calling FMP screener");
        
        const screenerRes = await fetch(screenerUrl);
        if (screenerRes.ok) {
          const result = await screenerRes.json();
          if (Array.isArray(result) && result.length > 0) {
            candidates = result;
            console.log(`[Breakout Screener] FMP returned ${candidates.length} candidates`);
          }
        } else {
          console.log(`[Breakout Screener] FMP screener returned ${screenerRes.status}, using fallback`);
        }
      } catch (e) {
        console.log("[Breakout Screener] FMP error, using fallback:", e);
      }
    }

    // If FMP failed or returned nothing, use fallback list with Polygon
    if (candidates.length === 0) {
      console.log("[Breakout Screener] Using fallback low-cap universe");
      usedFallback = true;
      candidates = LOW_CAP_UNIVERSE.map(symbol => ({ symbol, companyName: symbol }));
    }
    
    console.log(`[Breakout Screener] Processing ${candidates.length} candidates (fallback: ${usedFallback})`);

    // Step 2: Get market data
    // Try Polygon grouped endpoint first, then fall back to FMP batch quotes
    console.log(`[Breakout Screener] Fetching market data`);
    
    let marketData: Map<string, any> = new Map();
    let dataSource = "none";
    
    // Try Polygon's grouped daily endpoint with retry
    const today = new Date();
    const prevDate = new Date(today);
    prevDate.setDate(prevDate.getDate() - 1);
    if (prevDate.getDay() === 0) prevDate.setDate(prevDate.getDate() - 2);
    if (prevDate.getDay() === 6) prevDate.setDate(prevDate.getDate() - 1);
    
    const dateStr = prevDate.toISOString().split('T')[0];
    
    // Try with different dates if needed (in case market was closed)
    const datesToTry = [dateStr];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(prevDate);
      d.setDate(d.getDate() - i);
      datesToTry.push(d.toISOString().split('T')[0]);
    }
    
    if (polygonApiKey) {
      for (const tryDate of datesToTry) {
        if (marketData.size > 0) break;
        
        const groupedUrl = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${tryDate}?adjusted=true&apiKey=${polygonApiKey}`;
        
        try {
          const groupedRes = await fetch(groupedUrl);
          if (groupedRes.ok) {
            const groupedData = await groupedRes.json();
            if (groupedData.results && groupedData.results.length > 0) {
              for (const ticker of groupedData.results) {
                marketData.set(ticker.T, {
                  price: ticker.c,
                  open: ticker.o,
                  high: ticker.h,
                  low: ticker.l,
                  volume: ticker.v,
                  change: ticker.c - ticker.o,
                  changePercent: ((ticker.c - ticker.o) / ticker.o) * 100
                });
              }
              dataSource = "polygon";
              console.log(`[Breakout Screener] Polygon: Loaded ${marketData.size} tickers for ${tryDate}`);
            }
          } else if (groupedRes.status === 429) {
            console.log(`[Breakout Screener] Polygon rate limited, waiting...`);
            await new Promise(r => setTimeout(r, 2000));
          } else {
            console.log(`[Breakout Screener] Polygon grouped for ${tryDate} returned ${groupedRes.status}`);
          }
        } catch (e) {
          console.log(`[Breakout Screener] Polygon failed for ${tryDate}`);
        }
      }
    }
    
    // If Polygon failed, try FMP batch quotes
    if (marketData.size === 0 && fmpApiKey) {
      const symbolList = candidates.slice(0, 50).map((c: any) => c.symbol).join(',');
      const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${symbolList}?apikey=${fmpApiKey}`;
      
      try {
        const quoteRes = await fetch(quoteUrl);
        if (quoteRes.ok) {
          const quotes = await quoteRes.json();
          if (Array.isArray(quotes)) {
            for (const q of quotes) {
              marketData.set(q.symbol, {
                price: q.price,
                open: q.open,
                high: q.dayHigh,
                low: q.dayLow,
                volume: q.volume,
                avgVolume: q.avgVolume,
                change: q.change,
                changePercent: q.changesPercentage,
                marketCap: q.marketCap,
                pe: q.pe
              });
            }
            dataSource = "fmp";
            console.log(`[Breakout Screener] FMP: Loaded ${marketData.size} quotes`);
          }
        } else {
          console.log(`[Breakout Screener] FMP quotes returned ${quoteRes.status}`);
        }
      } catch (e) {
        console.log(`[Breakout Screener] FMP quotes failed`);
      }
    }
    
    // If still no data, try Alpha Vantage for a few key symbols (faster approach)
    if (marketData.size === 0 && alphaVantageKey) {
      console.log(`[Breakout Screener] Trying Alpha Vantage as fallback`);
      // Use batch quote endpoint if available, otherwise single quotes
      const topSymbols = candidates.slice(0, 3);
      
      for (const candidate of topSymbols) {
        try {
          const avUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${candidate.symbol}&apikey=${alphaVantageKey}`;
          const avRes = await fetch(avUrl);
          
          if (avRes.ok) {
            const avData = await avRes.json();
            const quote = avData["Global Quote"];
            
            if (quote && quote["05. price"]) {
              marketData.set(candidate.symbol, {
                price: parseFloat(quote["05. price"]),
                open: parseFloat(quote["02. open"]),
                high: parseFloat(quote["03. high"]),
                low: parseFloat(quote["04. low"]),
                volume: parseInt(quote["06. volume"]),
                change: parseFloat(quote["09. change"]),
                changePercent: parseFloat(quote["10. change percent"]?.replace('%', '') || '0'),
              });
            }
          }
          
          // Short delay between calls
          await new Promise(r => setTimeout(r, 500));
        } catch (e) {
          console.log(`[Breakout Screener] Alpha Vantage failed for ${candidate.symbol}`);
        }
      }
      
      if (marketData.size > 0) {
        dataSource = "alphavantage";
        console.log(`[Breakout Screener] Alpha Vantage: Loaded ${marketData.size} quotes`);
      }
    }
    
    // If still no data, return empty with explanation
    if (marketData.size === 0) {
      console.log(`[Breakout Screener] No market data available from any source`);
      return new Response(
        JSON.stringify({
          results: [],
          totalCandidates: candidates.length,
          scoredCandidates: 0,
          message: "Market data temporarily unavailable due to API rate limits. Please try again in a few minutes.",
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Process candidates using market data
    const results: BreakoutCandidate[] = [];
    
    for (const candidate of candidates.slice(0, 50)) {
      const symbol = candidate.symbol;
      const data = marketData.get(symbol);
      
      if (!data) continue;
      
      const price = data.price;
      if (!price || price > maxPrice || price < 0.5) continue;
      
      const volume = data.volume || 0;
      const avgVolume = data.avgVolume || volume;
      const relativeVolume = avgVolume > 0 ? volume / avgVolume : 1;
      const changePercent = data.changePercent || 0;
      
      // For simplified scoring without historical data
      // Focus on volume, price change, and available metrics
      const scoreBreakdown = {
        volumeScore: relativeVolume >= 2 ? 20 : relativeVolume >= 1.5 ? 15 : relativeVolume >= 1.2 ? 10 : 5,
        momentumScore: changePercent >= 5 ? 20 : changePercent >= 3 ? 15 : changePercent >= 1 ? 10 : changePercent > 0 ? 5 : 0,
        rsiScore: 10, // Default without historical data
        sentimentScore: 0,
        marketCapScore: (data.marketCap && data.marketCap >= 50000000 && data.marketCap <= 2000000000) ? 10 : 5,
        nearHighScore: data.high && price >= data.high * 0.98 ? 10 : 0,
        smaScore: 5, // Default without historical data
      };
      
      const breakoutScore = Object.values(scoreBreakdown).reduce((a, b) => a + b, 0);
      
      results.push({
        symbol,
        companyName: candidate.companyName || symbol,
        price,
        changePercent,
        volume,
        avgVolume,
        relativeVolume,
        marketCap: data.marketCap || candidate.marketCap || 0,
        breakoutScore,
        scoreBreakdown,
        sentiment: null,
        technicals: {
          rsi: 50, // Default
          sma20: 0,
          momentum5d: changePercent, // Use daily change as proxy
          nearHigh20d: data.high && price >= data.high * 0.98,
          aboveSma20: true, // Assume true without data
        },
        catalystFlag: changePercent >= 5 || relativeVolume >= 2,
      });
    }
    
    console.log(`[Breakout Screener] Scored ${results.length} candidates from ${dataSource}`);
    
    // If we got data from a source, try to enrich top candidates with historical data
    // Only do this if we have fewer API calls to make
    if (results.length > 0 && dataSource === "polygon") {
      // Sort first
      results.sort((a, b) => b.breakoutScore - a.breakoutScore);
      
      // Enrich top 10 with historical data
      const topSymbols = results.slice(0, 10).map(r => r.symbol);
      
      for (let i = 0; i < topSymbols.length; i++) {
        const symbol = topSymbols[i];
        try {
          const startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 25);
          
          const barsUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate.toISOString().split('T')[0]}/${today.toISOString().split('T')[0]}?adjusted=true&sort=desc&limit=20&apiKey=${polygonApiKey}`;
          
          const barsRes = await fetch(barsUrl);
          if (barsRes.ok) {
            const bars = await barsRes.json();
            if (bars.results && bars.results.length > 5) {
              const closes = bars.results.map((b: any) => b.c);
              const highs = bars.results.map((b: any) => b.h);
              const volumes = bars.results.map((b: any) => b.v);
              
              const result = results.find(r => r.symbol === symbol);
              if (result) {
                const rsi = closes.length > 14 ? calculateRSI(closes) : 50;
                const sma20 = closes.length >= 20 ? calculateSMA(closes, 20) : closes[0];
                const momentum5d = calculate5DayMomentum(closes);
                const high20d = Math.max(...highs);
                const avgVol5d = volumes.slice(1, 6).reduce((a: number, b: number) => a + b, 0) / 5;
                
                result.technicals.rsi = rsi;
                result.technicals.sma20 = sma20;
                result.technicals.momentum5d = momentum5d;
                result.technicals.nearHigh20d = result.price >= high20d * 0.95;
                result.technicals.aboveSma20 = result.price > sma20;
                result.relativeVolume = avgVol5d > 0 ? result.volume / avgVol5d : result.relativeVolume;
                
                // Recalculate scores
                result.scoreBreakdown.rsiScore = rsi >= 40 && rsi <= 70 ? 15 : rsi >= 30 && rsi <= 80 ? 10 : 5;
                result.scoreBreakdown.momentumScore = momentum5d >= 10 ? 20 : momentum5d >= 5 ? 15 : momentum5d >= 2 ? 10 : momentum5d > 0 ? 5 : 0;
                result.scoreBreakdown.nearHighScore = result.technicals.nearHigh20d ? 10 : 0;
                result.scoreBreakdown.smaScore = result.technicals.aboveSma20 ? 10 : 0;
                result.scoreBreakdown.volumeScore = result.relativeVolume >= 2 ? 20 : result.relativeVolume >= 1.5 ? 15 : result.relativeVolume >= 1.2 ? 10 : 5;
                
                result.breakoutScore = Object.values(result.scoreBreakdown).reduce((a, b) => a + b, 0);
                result.catalystFlag = momentum5d >= 10 || result.relativeVolume >= 3;
              }
            }
          }
          
          // Rate limit
          await new Promise(r => setTimeout(r, 250));
        } catch (e) {
          // Skip on error
        }
      }
    }
    
    // Sort by breakout score descending
    results.sort((a, b) => b.breakoutScore - a.breakoutScore);
    
    // Return top 25
    const topResults = results.slice(0, 25);
    
    console.log(`[Breakout Screener] Returning ${topResults.length} scored candidates`);
    
    return new Response(
      JSON.stringify({
        results: topResults,
        totalCandidates: candidates.length,
        scoredCandidates: results.length,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Breakout Screener] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
