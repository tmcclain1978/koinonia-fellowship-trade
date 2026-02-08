
# Penny Stock Research and Predictive Engine

## Summary

This plan creates a dedicated Penny Stock Research page featuring an AI-driven predictive engine that identifies potential breakout candidates. The system combines methodologies from experienced traders (Timothy Sykes, Ross Cameron, Humbled Trader, Jason Bond) with machine learning to surface high-probability setups with confidence scores and explanations.

## Architecture Overview

```text
+-------------------+     +------------------------+     +------------------+
|   Frontend Page   |---->|  Penny Stock Engine    |---->|   Watch-List     |
|  /penny-stocks    |     |  (Edge Function)       |     |   Dashboard      |
+-------------------+     +------------------------+     +------------------+
         |                          |
         v                          v
+-------------------+     +------------------------+     +------------------+
| Symbol Scanner    |     | Feature Engineering    |     | Prediction       |
| - Price < $10     |     | - Technical Indicators |     | - ML Scoring     |
| - Volume Spike    |     | - Sentiment Analysis   |     | - SHAP Explain   |
| - Low Float       |     | - Pattern Detection    |     | - Confidence %   |
+-------------------+     +------------------------+     +------------------+
                                    |
                                    v
                          +------------------------+
                          | Lovable AI (Gemini)    |
                          | - Pattern Recognition  |
                          | - Sentiment Scoring    |
                          | - Breakout Probability |
                          +------------------------+
```

## What Gets Built

### 1. New Page: `/penny-stocks`

A dedicated research dashboard with:

- **Watch-List Panel**: Ranked table of breakout candidates with symbol, price, % change, volume, float, confidence score, and catalyst flags
- **Detailed Stock View**: Mini-chart, technical overlays, news headlines, sentiment gauge, and feature importance breakdown
- **Scanner Controls**: Configurable filters for price range, volume threshold, float size, and pattern types
- **AI Explanations**: Natural language reasoning for each prediction (e.g., "Strong volume breakout on FDA news catalyst")

### 2. New Edge Function: `penny-stock-engine`

The core predictive engine that:

- Scans universe of penny stocks (under $10, min volume, max float)
- Computes technical features: RSI, VWAP, SMAs, relative volume, ATR, momentum
- Detects chart patterns: Bull flags, flat-top breakouts, pennants
- Analyzes news sentiment using existing `news-sentiment-scanner`
- Runs predictions using Lovable AI with structured output
- Returns ranked candidates with breakout probability and explanations

### 3. Database Table: `penny_stock_predictions`

Stores prediction history for:

- Tracking accuracy over time
- Learning from past predictions
- User watchlist management

### 4. Supporting Components

- **PennyStockWatchlist**: Sortable/filterable candidate table
- **PennyStockDetail**: Expanded view with charts and analysis
- **BreakoutPatternDetector**: Visual pattern identification
- **PredictionExplainer**: SHAP-style feature importance display

---

## Technical Implementation

### Part 1: Database Schema

```sql
-- Store penny stock predictions for tracking and learning
CREATE TABLE public.penny_stock_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  prediction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Prediction outputs
  breakout_probability NUMERIC NOT NULL,
  confidence_rank TEXT CHECK (confidence_rank IN ('High', 'Moderate', 'Low')),
  predicted_direction TEXT CHECK (predicted_direction IN ('bullish', 'bearish', 'neutral')),
  
  -- Feature snapshot
  price_at_prediction NUMERIC,
  volume_at_prediction BIGINT,
  relative_volume NUMERIC,
  market_cap NUMERIC,
  float_shares NUMERIC,
  short_interest NUMERIC,
  
  -- Technical indicators
  rsi NUMERIC,
  vwap NUMERIC,
  sma_20 NUMERIC,
  momentum_5d NUMERIC,
  near_52w_high BOOLEAN DEFAULT false,
  pattern_detected TEXT, -- 'bull_flag', 'flat_top', 'pennant', etc.
  
  -- Sentiment
  news_sentiment_score NUMERIC,
  catalyst_type TEXT, -- 'earnings', 'fda', 'partnership', 'sector', etc.
  catalyst_headline TEXT,
  
  -- AI explanation
  reasoning TEXT,
  key_factors JSONB DEFAULT '[]'::jsonb,
  risk_flags JSONB DEFAULT '[]'::jsonb,
  
  -- Outcome tracking
  actual_outcome TEXT, -- 'hit_target', 'stopped_out', 'neutral', NULL if pending
  price_after_5d NUMERIC,
  max_gain_5d NUMERIC,
  was_accurate BOOLEAN,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(user_id, symbol, prediction_date)
);

-- User's saved penny stock watchlist
CREATE TABLE public.penny_stock_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notes TEXT,
  alert_enabled BOOLEAN DEFAULT false,
  
  UNIQUE(user_id, symbol)
);

-- Enable RLS
ALTER TABLE public.penny_stock_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penny_stock_watchlist ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users manage own predictions"
  ON public.penny_stock_predictions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users manage own watchlist"
  ON public.penny_stock_watchlist FOR ALL
  USING (auth.uid() = user_id);

-- Enable realtime for watchlist
ALTER PUBLICATION supabase_realtime ADD TABLE public.penny_stock_watchlist;
```

### Part 2: Edge Function - penny-stock-engine

File: `supabase/functions/penny-stock-engine/index.ts`

```typescript
// Core structure (full implementation in build phase)
interface PennyStockCandidate {
  symbol: string;
  companyName: string;
  price: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  relativeVolume: number;
  marketCap: number;
  floatShares: number;
  shortInterest: number;
  
  technicals: {
    rsi: number;
    vwap: number;
    sma20: number;
    ema9: number;
    ema20: number;
    momentum5d: number;
    nearHigh52w: boolean;
    aboveVwap: boolean;
    emaCrossover: boolean;
  };
  
  patterns: {
    bullFlag: boolean;
    flatTopBreakout: boolean;
    pennant: boolean;
    fishHook: boolean;
    gapUp: boolean;
  };
  
  sentiment: {
    score: number;
    label: 'Bullish' | 'Bearish' | 'Neutral';
    catalystType: string | null;
    headline: string | null;
  };
  
  prediction: {
    breakoutProbability: number;
    confidenceRank: 'High' | 'Moderate' | 'Low';
    reasoning: string;
    keyFactors: string[];
    riskFlags: string[];
  };
}
```

The engine will:

1. **Scan Universe**: Fetch stocks under $10 with volume > 500K
2. **Calculate Features**: Technical indicators (RSI, VWAP, EMAs, momentum)
3. **Detect Patterns**: Bull flag, flat-top, pennant using price action rules
4. **Analyze Sentiment**: Call `news-sentiment-scanner` for each candidate
5. **AI Prediction**: Use Lovable AI with structured tool calling to get:
   - Breakout probability (0-100%)
   - Confidence rank
   - Natural language reasoning
   - Key contributing factors
   - Risk warnings

### Part 3: Frontend Page

File: `src/pages/PennyStocks.tsx`

Key sections:

1. **Scanner Controls** (top panel)
   - Price range slider ($0.50 - $10)
   - Min volume filter
   - Float size filter  
   - Pattern type checkboxes
   - Scan button with progress indicator

2. **Watch-List Table** (main area)
   - Sortable columns: Symbol, Price, Change%, Volume, RVOL, Score, Patterns
   - Color-coded confidence badges (green/yellow/red)
   - Add to watchlist button
   - Click to expand details

3. **Detailed View** (slide-out panel)
   - Price chart with indicators
   - News headlines with sentiment scores
   - AI reasoning explanation
   - Feature importance bars
   - Risk warning cards
   - "Add to Watchlist" / "Set Alert" buttons

4. **My Watchlist** (sidebar tab)
   - Saved symbols with quick stats
   - Alert status indicators
   - Remove button

### Part 4: Components

| Component | Purpose |
|-----------|---------|
| `PennyStockScanner.tsx` | Scanner controls and execution |
| `PennyStockWatchlist.tsx` | Main results table |
| `PennyStockDetailPanel.tsx` | Expanded stock analysis view |
| `BreakoutPatternBadge.tsx` | Visual pattern indicator |
| `ConfidenceGauge.tsx` | Circular probability display |
| `FeatureImportanceChart.tsx` | Bar chart of contributing factors |
| `CatalystNewsFeed.tsx` | Sentiment-tagged headlines |
| `RiskFlagCard.tsx` | Warning display component |

### Part 5: Navigation Update

Add "Penny Stocks" link to Navigation.tsx in the authenticated menu between "Bot Testing" and "PocketOption".

### Part 6: Route Registration

Add to App.tsx:
```typescript
import PennyStocks from "./pages/PennyStocks";
// ...
<Route path="/penny-stocks" element={<PennyStocks />} />
```

---

## Feature Scoring System

Based on the PDF research, the scoring uses a 100-point system:

| Feature Category | Max Points | Criteria |
|------------------|------------|----------|
| Volume Score | 20 | RVOL >= 2x = 20, >= 1.5x = 15, >= 1.2x = 10 |
| Momentum Score | 20 | 5d change >= 10% = 20, >= 5% = 15, >= 2% = 10 |
| RSI Score | 15 | 40-70 (ideal) = 15, 30-80 = 10, else = 5 |
| Pattern Score | 15 | Bull flag/pennant = 15, near breakout = 10 |
| Sentiment Score | 15 | Bullish + catalyst = 15, bullish = 10, neutral = 5 |
| Float/Short Score | 10 | Low float + high short = 10, either = 5 |
| Near High Score | 5 | Within 5% of 20d high = 5 |

**Confidence Ranks:**
- High: Score >= 75
- Moderate: Score >= 55
- Low: Score < 55

---

## AI Prediction Prompt (Lovable AI)

The edge function will use this structured prompt with tool calling:

```text
You are an expert penny stock analyst combining methods from:
- Timothy Sykes (momentum, pre-spike patterns)
- Ross Cameron (bull flags, first pullback entries)
- Humbled Trader (VWAP, market cycles)
- Jason Bond (pennants, rockets, fishhooks)

Analyze this penny stock for breakout potential:
[Technical data, sentiment, patterns]

Return structured prediction with reasoning.
```

Tool definition extracts:
- `breakout_probability`: 0-100
- `confidence_rank`: High/Moderate/Low
- `reasoning`: 2-3 sentence explanation
- `key_factors`: Array of top 3 contributors
- `risk_flags`: Array of warnings (dilution, pump-and-dump, etc.)

---

## Files to Create

| File | Type |
|------|------|
| `src/pages/PennyStocks.tsx` | Page component |
| `src/components/penny-stocks/PennyStockScanner.tsx` | Scanner UI |
| `src/components/penny-stocks/PennyStockWatchlist.tsx` | Results table |
| `src/components/penny-stocks/PennyStockDetailPanel.tsx` | Detail view |
| `src/components/penny-stocks/BreakoutPatternBadge.tsx` | Pattern indicator |
| `src/components/penny-stocks/ConfidenceGauge.tsx` | Score display |
| `src/components/penny-stocks/FeatureImportanceChart.tsx` | Factor bars |
| `src/components/penny-stocks/CatalystNewsFeed.tsx` | News panel |
| `src/components/penny-stocks/index.ts` | Barrel export |
| `supabase/functions/penny-stock-engine/index.ts` | Edge function |
| `src/hooks/usePennyStockScanner.ts` | Scanner hook |

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add route for `/penny-stocks` |
| `src/components/Navigation.tsx` | Add nav link |
| `supabase/config.toml` | Register new edge function |

---

## Safety & Disclaimers

Per the PDF requirements, the page will include:

1. **Header Banner**: "For Research Purposes Only - Not Financial Advice"
2. **Risk Warning Card**: Penny stocks are highly speculative
3. **Disclaimer Footer**: Users must conduct own due diligence
4. **No Trade Execution**: Research only, no automated trading

---

## Verification Checklist

After implementation:

1. Navigate to `/penny-stocks` - page loads without errors
2. Run scanner with default filters - candidates appear
3. Click a candidate - detail panel shows chart + analysis
4. Check AI reasoning - natural language explanation appears
5. Add to watchlist - symbol persists across sessions
6. Verify mobile responsiveness
7. Test with various symbols to confirm data accuracy
