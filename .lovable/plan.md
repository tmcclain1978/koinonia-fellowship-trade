
# Review: Live Data for All S&P 500 Stocks

## Executive Summary

After a thorough review of the data architecture, **the app is already designed to support live data for ALL S&P 500 stocks** when API keys are properly configured. However, there are a few edge cases that can cause mock/fallback data to be used.

## Current State Assessment

### Data Sources (Priority Order)
| Source | Status | Covers All S&P 500? |
|--------|--------|---------------------|
| Schwab API | Requires OAuth | Yes (when authenticated) |
| Polygon.io | Configured | Yes |
| Alpha Vantage | Configured | Yes (25 req/day limit) |
| FMP | Configured | Yes |
| Mock Data | Last resort | No (hardcoded 8 stocks) |

### Where You'll See Live Data vs Mock Data

**Live Data (Polygon/Schwab):**
- ProChartKit charts - uses `fetch-schwab-candles` with proper fallback
- LivePriceDisplay - uses `market-data-stream` → Polygon
- SchwabLiveQuotes - uses `schwab-quotes` → Polygon fallback

**Potential Mock Data Scenarios:**
- No authorization header in request
- Schwab rate limit (3-second intervals)
- Polygon API rate limit exceeded
- All APIs fail simultaneously

## Identified Gap

In `schwab-quotes/index.ts`, when Polygon is unreachable, the mock data generator only has hardcoded prices for 8 symbols:
```
AAPL, MSFT, GOOGL, AMZN, TSLA, SPY, QQQ, NVDA
```

All other stocks receive random prices ($100-$300), which is incorrect.

## Recommended Fix

Update the `returnMockQuotes` function in `schwab-quotes/index.ts` to:

1. **Always attempt Polygon fetch** for the actual closing price (current behavior)
2. **Add FMP as secondary fallback** for real price data before resorting to random values
3. **Remove hardcoded price map** in favor of API-only pricing

### Technical Changes

**File: `supabase/functions/schwab-quotes/index.ts`**

Modify the `returnMockQuotes` function to:

```typescript
async function returnMockQuotes(symbols: string | string[]) {
  const symbolList = Array.isArray(symbols) ? symbols : symbols.split(',');
  const POLYGON_API_KEY = Deno.env.get('POLYGON_API_KEY');
  const FMP_API_KEY = Deno.env.get('FMP_API_KEY');
  
  const quotes = await Promise.all(symbolList.map(async (symbol) => {
    const sym = symbol.trim().toUpperCase();
    let basePrice: number | null = null;
    let source = 'mock';
    
    // Try Polygon first
    if (POLYGON_API_KEY && !basePrice) {
      try {
        const response = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
        );
        const data = await response.json();
        if (data.results?.[0]?.c) {
          basePrice = data.results[0].c;
          source = 'polygon-fallback';
        }
      } catch (e) {
        console.log(`Could not fetch ${sym} from Polygon`);
      }
    }
    
    // Try FMP as secondary fallback
    if (FMP_API_KEY && !basePrice) {
      try {
        const response = await fetch(
          `https://financialmodelingprep.com/api/v3/quote/${sym}?apikey=${FMP_API_KEY}`
        );
        const data = await response.json();
        if (data?.[0]?.price) {
          basePrice = data[0].price;
          source = 'fmp-fallback';
        }
      } catch (e) {
        console.log(`Could not fetch ${sym} from FMP`);
      }
    }
    
    // Last resort: use a reasonable placeholder
    if (!basePrice) {
      basePrice = 100;
      source = 'mock';
    }
    
    // Build quote object...
  }));
  
  return new Response(...);
}
```

## Verification Steps

After implementation, verify by:

1. Open Paper Trading page
2. Enter any S&P 500 symbol (e.g., "XOM", "CVS", "PG")
3. Check that the chart shows real candle data
4. Check the Live Market Data panel shows "Polygon Live" badge
5. Check console/network for data source confirmation

## No Changes Needed

The following components already properly support all S&P 500 stocks:
- `fetch-schwab-candles/index.ts` - comprehensive fallback chain
- `market-data-stream/index.ts` - Polygon for all symbols
- `useMarketDataStream.ts` - proper API integration
- `fetch-sp500-constituents/index.ts` - full S&P 500 list

## Summary

The fix is focused on one edge function (`schwab-quotes`) to ensure that when Schwab auth is unavailable, the system gracefully falls back to Polygon and FMP for **any** symbol's real price data, not just the 8 hardcoded major stocks.
