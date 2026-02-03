

# Stock Screener Enhancement Plan

## Overview

This plan enhances the stock screener with two major capabilities:
1. **S&P 500 Universe Support** - Allow screening all ~500 stocks in the S&P 500 index for existing presets
2. **Low-Cap Breakout Preset** - A new intelligent preset for finding stocks under $10 with breakout potential based on news sentiment, momentum, volume, and technical factors

---

## Current State

The stock screener currently:
- Uses a hardcoded list of ~60-70 popular stocks (AAPL, MSFT, NVDA, etc.)
- Screens using Polygon.io API for real-time quotes and technical indicators
- Supports 8 quick presets (Volume Breakout, Oversold RSI, etc.)
- Calculates RSI, SMA, ATR, and relative volume

**Available APIs:**
- **FMP API** (already configured) - Has S&P 500 constituent list endpoint and a powerful stock screener with filters for price, volume, market cap, beta
- **Polygon API** (already configured) - Real-time quotes and historical data
- **News Sentiment Scanner** (already built) - AI-powered sentiment analysis via Lovable AI

---

## Implementation Plan

### Phase 1: S&P 500 Universe Support

#### 1.1 Create New Edge Function: `fetch-sp500-constituents`
A lightweight function to fetch and cache the S&P 500 stock list from FMP API.

**File:** `supabase/functions/fetch-sp500-constituents/index.ts`

**Functionality:**
- Call FMP API endpoint: `https://financialmodelingprep.com/stable/sp500-constituent?apikey={FMP_API_KEY}`
- Return array of ~500 symbols with sector information
- Include basic caching headers (list changes infrequently)

#### 1.2 Update Stock Screener Component
Modify `src/components/StockScreener.tsx` to add a stock universe selector.

**Changes:**
- Add new state: `stockUniverse` with options: "Default (Top 60)", "S&P 500 (All 500)", "Custom"
- Add a dropdown selector in the UI above the conditions builder
- When S&P 500 is selected, fetch the full list before running the scan
- Show loading indicator and warning that larger scans take longer (~30-60 seconds)

#### 1.3 Update Edge Function: `stock-screener-live`
Modify to handle larger symbol lists more efficiently.

**Changes:**
- Increase batch size from 10 to 20 for faster processing
- Add progress logging for large scans
- Optimize API calls by using Polygon's multi-ticker snapshot when possible
- Add `universe` parameter to identify the source

---

### Phase 2: Low-Cap Breakout Preset

#### 2.1 Create New Edge Function: `screen-breakout-candidates`
A specialized screening function that uses multiple data sources for breakout detection.

**File:** `supabase/functions/screen-breakout-candidates/index.ts`

**Breakout Criteria Scoring (100 points total):**

| Factor | Points | Data Source |
|--------|--------|-------------|
| Price under $10 | Required | FMP Screener |
| Volume spike (2x+ avg) | 20 | Polygon Snapshot |
| Recent price momentum (>5% in 5 days) | 20 | Polygon Historical |
| RSI between 40-70 (momentum zone) | 15 | Calculated |
| News sentiment (bullish) | 15 | news-sentiment-scanner |
| Market cap $50M-$2B (sweet spot) | 10 | FMP Profile |
| Near 20-day high | 10 | Polygon Historical |
| Above SMA20 | 10 | Calculated |

**Workflow:**
1. Use FMP Company Screener API to get stocks:
   - `priceLowerThan=10`
   - `priceMoreThan=0.50` (avoid sub-penny)
   - `marketCapMoreThan=50000000` ($50M minimum)
   - `marketCapLowerThan=2000000000` ($2B maximum)
   - `volumeMoreThan=100000` (minimum liquidity)
   - `isActivelyTrading=true`
   - `isEtf=false`, `isFund=false`
   - `exchange=NASDAQ,NYSE,AMEX`
   - `limit=100`

2. For each candidate, fetch:
   - Real-time quote from Polygon
   - 20-day historical bars for momentum/SMA calculation
   - News sentiment (batch up to 10 at a time)

3. Score and rank candidates

4. Return top 25 with detailed breakdown

#### 2.2 Update StockScreener Component

**Add new preset to DEFAULT_PRESETS array:**
```javascript
{
  name: "Low-Cap Breakout",
  description: "Stocks under $10 with momentum and catalyst signals",
  conditions: [
    { id: "1", type: "price_below", operator: "<", value: 10 },
    { id: "2", type: "volume_spike", operator: ">", value: 2 },
    { id: "3", type: "price_change_above", operator: ">", value: 3 },
    { id: "4", type: "market_cap_below", operator: "<", value: 2 },
  ],
  isSpecialPreset: true  // Flag to use specialized endpoint
}
```

**UI Changes:**
- When "Low-Cap Breakout" preset is selected, show a special indicator that this uses AI sentiment analysis
- Display additional columns in results: News Sentiment, Momentum Score, Catalyst Flag
- Add tooltip explaining the multi-factor approach

#### 2.3 Add New Condition Types

Add to `CONDITION_TYPES` array:
```javascript
{ id: "momentum_5d", label: "5-Day Momentum %", category: "Technical", unit: "%" },
{ id: "news_bullish", label: "Bullish News Sentiment", category: "Sentiment", unit: "" },
{ id: "has_catalyst", label: "Has Recent Catalyst", category: "Sentiment", unit: "" },
```

---

### Phase 3: UI Enhancements

#### 3.1 Universe Selector Component
Add a stock universe dropdown in the Build Scan tab:

```
┌─────────────────────────────────────────────────┐
│  Stock Universe                                 │
│  ┌───────────────────────────────────────────┐  │
│  │ 📊 Default (Top 60 Liquid Stocks)      ▼ │  │
│  └───────────────────────────────────────────┘  │
│  Options:                                       │
│  • Default (Top 60 Liquid Stocks)              │
│  • S&P 500 (All ~500 Stocks) ⚡ Slower         │
│  • Custom Symbols                              │
└─────────────────────────────────────────────────┘
```

#### 3.2 Enhanced Results Display for Breakout Preset

```
┌─────────────────────────────────────────────────┐
│ 🔥 ABCD  $8.45  +12.3%                    92%  │
│ ──────────────────────────────────────────────  │
│ 📰 Bullish News    📈 Strong Momentum          │
│ Vol: 5.2M (3.4x)   MCap: $450M                 │
│                                                 │
│ "Company announces breakthrough patent..."      │
│                                                 │
│ [RSI: 58] [SMA20 ✓] [Near High ✓] [Vol ✓]     │
│                                       ⭐ Add    │
└─────────────────────────────────────────────────┘
```

---

## Technical Details

### API Rate Limiting Strategy

**For S&P 500 Scans (~500 stocks):**
- Polygon allows ~5 requests/second on free tier
- Process in batches of 20 with 200ms delays
- Total time: ~50-60 seconds for full scan
- Show progress bar during scan

**For Breakout Candidates:**
- FMP screener returns pre-filtered list (~50-100 stocks)
- Only fetch detailed data for top candidates
- News sentiment in parallel batches of 5
- Total time: ~15-20 seconds

### Caching Strategy

- S&P 500 constituent list: Cache for 24 hours (changes rarely)
- FMP screener results: No cache (prices change constantly)
- News sentiment: Cache for 1 hour per symbol

---

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/fetch-sp500-constituents/index.ts` | Fetch S&P 500 stock list from FMP |
| `supabase/functions/screen-breakout-candidates/index.ts` | Specialized breakout screening with AI sentiment |

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/StockScreener.tsx` | Add universe selector, new preset, enhanced results display |
| `supabase/functions/stock-screener-live/index.ts` | Handle larger symbol lists, add new condition types |

---

## Summary

This enhancement transforms the stock screener from a basic preset-based tool into a comprehensive screening platform that can:

1. **Screen the entire S&P 500** - Giving users access to all major US stocks instead of just 60
2. **Find breakout candidates intelligently** - Using a multi-factor approach combining price, volume, momentum, and AI-powered news sentiment analysis
3. **Display richer information** - Including sentiment indicators, momentum scores, and catalyst flags for better decision-making

The implementation leverages existing infrastructure (FMP API key, Polygon API, Lovable AI sentiment) while adding new specialized functionality.

