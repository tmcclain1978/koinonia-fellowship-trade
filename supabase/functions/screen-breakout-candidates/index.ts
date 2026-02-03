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
const LOW_CAP_UNIVERSE = [
  // Known low-cap/penny stocks and small caps
  "SOUN", "PLTR", "SOFI", "NIO", "LCID", "RIVN", "PLUG", "SNAP", "HOOD", "DKNG",
  "COIN", "RBLX", "AFRM", "UPST", "PATH", "U", "DOCN", "CRWD", "NET", "TWLO",
  "ROKU", "WISH", "CLOV", "SKLZ", "SPCE", "BB", "TLRY", "SNDL", "ACB", "CGC",
  "MARA", "RIOT", "BITF", "HUT", "CLSK", "BTBT", "SOS", "EBON", "CANF", "NCTY",
  "ATER", "CENN", "MULN", "FFIE", "GOEV", "ARVL", "REE", "PSNY", "FSR", "NKLA",
  "WKHS", "RIDE", "HYLN", "BLNK", "CHPT", "EVGO", "DCFC", "SHLS", "ARRY", "MAXN"
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const polygonApiKey = Deno.env.get("POLYGON_API_KEY");
    const fmpApiKey = Deno.env.get("FMP_API_KEY");
    
    if (!polygonApiKey) {
      return new Response(
        JSON.stringify({ error: "Polygon API key not configured" }),
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

    // Step 2: Enrich with Polygon data and calculate scores
    const results: BreakoutCandidate[] = [];
    const batchSize = 5;
    
    for (let i = 0; i < Math.min(candidates.length, 50); i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (candidate: any) => {
        const symbol = candidate.symbol;
        
        try {
          // Fetch Polygon snapshot
          const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${polygonApiKey}`;
          const snapshotRes = await fetch(snapshotUrl);
          
          if (!snapshotRes.ok) return null;
          
          const snapshot = await snapshotRes.json();
          const ticker = snapshot.ticker;
          
          if (!ticker?.day) return null;
          
          // Fetch 20-day history for technicals
          const today = new Date();
          const startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 30);
          
          const barsUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate.toISOString().split('T')[0]}/${today.toISOString().split('T')[0]}?adjusted=true&sort=desc&limit=30&apiKey=${polygonApiKey}`;
          
          let historicalData: { c: number[], h: number[], l: number[] } = { c: [], h: [], l: [] };
          
          try {
            const barsRes = await fetch(barsUrl);
            if (barsRes.ok) {
              const bars = await barsRes.json();
              if (bars.results) {
                historicalData = {
                  c: bars.results.map((b: any) => b.c),
                  h: bars.results.map((b: any) => b.h),
                  l: bars.results.map((b: any) => b.l),
                };
              }
            }
          } catch (e) {
            console.log(`[Breakout Screener] No history for ${symbol}`);
          }
          
          // Calculate technicals
          const rsi = historicalData.c.length > 14 ? calculateRSI(historicalData.c) : 50;
          const sma20 = historicalData.c.length >= 20 ? calculateSMA(historicalData.c, 20) : 0;
          const momentum5d = calculate5DayMomentum(historicalData.c);
          const high20d = historicalData.h.length >= 20 ? Math.max(...historicalData.h.slice(0, 20)) : ticker.day?.h || 0;
          
          const currentPrice = ticker.day?.c || candidate.price || 0;
          const prevClose = ticker.prevDay?.c || currentPrice;
          const changePercent = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;
          const volume = ticker.day?.v || candidate.volume || 0;
          const avgVolume = ticker.prevDay?.v || volume;
          const relativeVolume = avgVolume > 0 ? volume / avgVolume : 1;
          
          const nearHigh20d = high20d > 0 && currentPrice >= high20d * 0.95;
          const aboveSma20 = sma20 > 0 && currentPrice > sma20;
          
          // Calculate scores (100 points total)
          const scoreBreakdown = {
            volumeScore: relativeVolume >= 2 ? 20 : relativeVolume >= 1.5 ? 15 : relativeVolume >= 1.2 ? 10 : 5,
            momentumScore: momentum5d >= 10 ? 20 : momentum5d >= 5 ? 15 : momentum5d >= 2 ? 10 : momentum5d > 0 ? 5 : 0,
            rsiScore: rsi >= 40 && rsi <= 70 ? 15 : rsi >= 30 && rsi <= 80 ? 10 : 5,
            sentimentScore: 0, // Will be filled if sentiment is fetched
            marketCapScore: candidate.marketCap >= 50000000 && candidate.marketCap <= 2000000000 ? 10 : 5,
            nearHighScore: nearHigh20d ? 10 : 0,
            smaScore: aboveSma20 ? 10 : 0,
          };
          
          let sentiment: BreakoutCandidate['sentiment'] = null;
          
          // Optionally fetch sentiment
          if (includeSentiment && results.length < 25) {
            try {
              // Use the project's news-sentiment-scanner function
              const sentimentUrl = `${Deno.env.get('SUPABASE_URL') || 'https://cxsfpxsbejzpukrdrulu.supabase.co'}/functions/v1/news-sentiment-scanner`;
              const sentimentRes = await fetch(sentimentUrl, {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY') || ''}`,
                },
                body: JSON.stringify({ symbols: [symbol] }),
              });
              
              if (sentimentRes.ok) {
                const sentimentData = await sentimentRes.json();
                if (sentimentData.results?.[symbol]) {
                  const s = sentimentData.results[symbol];
                  sentiment = {
                    overall: s.sentiment || 'neutral',
                    score: s.sentimentScore || 0,
                    headline: s.headlines?.[0],
                  };
                  
                  // Add sentiment score
                  if (s.sentiment === 'bullish') scoreBreakdown.sentimentScore = 15;
                  else if (s.sentiment === 'neutral') scoreBreakdown.sentimentScore = 5;
                }
              }
            } catch (e) {
              console.log(`[Breakout Screener] Sentiment fetch failed for ${symbol}`);
            }
          }
          
          const breakoutScore = Object.values(scoreBreakdown).reduce((a, b) => a + b, 0);
          
          return {
            symbol,
            companyName: candidate.companyName || symbol,
            price: currentPrice,
            changePercent,
            volume,
            avgVolume,
            relativeVolume,
            marketCap: candidate.marketCap || 0,
            breakoutScore,
            scoreBreakdown,
            sentiment,
            technicals: {
              rsi,
              sma20,
              momentum5d,
              nearHigh20d,
              aboveSma20,
            },
            catalystFlag: sentiment?.overall === 'bullish' || momentum5d >= 10 || relativeVolume >= 3,
          } as BreakoutCandidate;
        } catch (e) {
          console.error(`[Breakout Screener] Error processing ${symbol}:`, e);
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((r): r is BreakoutCandidate => r !== null));
      
      // Rate limit delay
      if (i + batchSize < candidates.length) {
        await new Promise(r => setTimeout(r, 250));
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
