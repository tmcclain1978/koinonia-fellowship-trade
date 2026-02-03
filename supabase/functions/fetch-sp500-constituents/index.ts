import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "public, max-age=86400", // Cache for 24 hours
};

// Fallback S&P 500 list (top ~200 by market cap, commonly traded)
const FALLBACK_SP500 = [
  "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "BRK.B", "UNH", "XOM",
  "JPM", "JNJ", "V", "PG", "MA", "HD", "CVX", "MRK", "ABBV", "LLY",
  "PEP", "KO", "AVGO", "COST", "WMT", "MCD", "CSCO", "TMO", "ACN", "ABT",
  "CRM", "DHR", "NFLX", "AMD", "ADBE", "WFC", "TXN", "PM", "NEE", "BMY",
  "UPS", "RTX", "INTC", "ORCL", "UNP", "LIN", "QCOM", "LOW", "MS", "T",
  "BA", "SCHW", "HON", "IBM", "AMGN", "GS", "ELV", "CAT", "INTU", "PLD",
  "DE", "GE", "BKNG", "AXP", "ISRG", "MDLZ", "ADI", "GILD", "BLK", "VRTX",
  "SYK", "TJX", "MMC", "CB", "ADP", "REGN", "CVS", "CI", "NOW", "MO",
  "SPGI", "ZTS", "PNC", "BDX", "SBUX", "SO", "DUK", "EQIX", "CME", "ICE",
  "CL", "PYPL", "MU", "MCO", "LRCX", "NOC", "ITW", "SHW", "USB", "CSX",
  "ETN", "APD", "AON", "EMR", "PGR", "HUM", "FCX", "TGT", "NSC", "GD",
  "MCK", "ATVI", "MNST", "ORLY", "ADSK", "AZO", "FTNT", "SLB", "ROP", "SNPS",
  "AJG", "CDNS", "MET", "TRV", "AFL", "PSX", "MRNA", "KMB", "D", "DG",
  "ANET", "MCHP", "EW", "CMG", "WM", "WELL", "O", "CTAS", "CNC", "VLO",
  "GM", "F", "KHC", "LHX", "MSCI", "YUM", "OXY", "A", "PAYX", "PCAR",
  "HCA", "CTSH", "IQV", "ROST", "STZ", "DD", "DXCM", "EA", "AEP", "NUE",
  "IDXX", "DHI", "GIS", "PRU", "VRSK", "ODFL", "HSY", "AME", "RMD", "BIIB",
  "WMB", "FAST", "XEL", "HLT", "HPQ", "BK", "ILMN", "KEYS", "MTD", "GPN",
  "IT", "TEL", "EXC", "CPRT", "DOW", "ALB", "CDW", "VICI", "WBD", "DLTR",
  "KR", "EBAY", "AVB", "AWK", "EFX", "ZBH", "CBRE", "HAL", "ROK", "FITB"
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fmpApiKey = Deno.env.get("FMP_API_KEY");
    
    if (!fmpApiKey) {
      console.log("[S&P 500] FMP_API_KEY not configured, using fallback list");
      return new Response(
        JSON.stringify({
          symbols: FALLBACK_SP500,
          count: FALLBACK_SP500.length,
          source: "fallback",
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[S&P 500] Fetching S&P 500 constituents from FMP API");
    
    const url = `https://financialmodelingprep.com/stable/sp500-constituent?apikey=${fmpApiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.log(`[S&P 500] FMP API error: ${response.status}, using fallback`);
      return new Response(
        JSON.stringify({
          symbols: FALLBACK_SP500,
          count: FALLBACK_SP500.length,
          source: "fallback",
          note: "FMP API unavailable, using cached list",
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      console.log("[S&P 500] Empty response from FMP, using fallback");
      return new Response(
        JSON.stringify({
          symbols: FALLBACK_SP500,
          count: FALLBACK_SP500.length,
          source: "fallback",
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[S&P 500] Retrieved ${data.length} constituents from FMP`);
    
    const symbols = data.map((item: any) => item.symbol);
    const sectors = [...new Set(data.map((item: any) => item.sector))].filter(Boolean).sort();
    
    return new Response(
      JSON.stringify({
        symbols,
        sectors,
        count: symbols.length,
        source: "fmp",
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[S&P 500] Error:", error);
    // Return fallback on any error
    return new Response(
      JSON.stringify({
        symbols: FALLBACK_SP500,
        count: FALLBACK_SP500.length,
        source: "fallback",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
