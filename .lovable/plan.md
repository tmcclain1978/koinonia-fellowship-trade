
# PocketOption OTC Candle Pattern Prediction Engine

## Overview

This plan creates a sophisticated prediction engine specifically designed for PocketOption OTC (Over-The-Counter) pairs. Unlike exchange-traded markets, OTC pairs are dealer-controlled and exhibit **repeating cyclical patterns** - this is the key insight we'll exploit.

The engine will:
1. **Collect and store real candle data** from PocketOption WebSocket
2. **Detect repeating sequences** using pattern matching algorithms
3. **Predict the next candle** based on historical pattern matches
4. **Track accuracy** to continuously improve predictions

---

## How OTC Pattern Prediction Works

OTC pairs often repeat in cycles because they're synthetically generated. The prediction approach:

```text
Historical Pattern (stored):     [up, up, down, up, down, down, up, up, down]
Current Live Sequence:           [up, up, down, up, down, down, up, up, ???]
                                                                      ^
                                                                 PREDICT: down (89% match)
```

**Key Techniques:**
1. **Sequence Matching** - Find historical sequences that match the current N candles
2. **Cycle Detection** - Identify repeating cycles (e.g., every 12-15 candles)
3. **Markov Chains** - Probabilistic next-state prediction based on transitions
4. **Pattern Fingerprinting** - Convert candle sequences to fingerprints for fast matching

---

## Implementation Plan

### Phase 1: Candle Data Collection & Storage

#### 1.1 Create Database Table: `pocketoption_candles`
Store incoming candle data for pattern analysis.

**Schema:**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | User reference |
| pair | VARCHAR | e.g., "EUR/USD" |
| timestamp | TIMESTAMPTZ | Candle time |
| open | NUMERIC | Open price |
| high | NUMERIC | High price |
| low | NUMERIC | Low price |
| close | NUMERIC | Close price |
| direction | VARCHAR | "up" or "down" |
| timeframe | VARCHAR | "1m", "5m", etc. |

**Indexes:**
- `(pair, timestamp)` for time-series queries
- `(user_id, pair)` for user-specific pattern learning

#### 1.2 Update WebSocket Hook to Store Candles
Modify `usePocketOptionWebSocket.ts` to:
- Buffer incoming candles in state
- Persist to database in batches (every 10 candles or 30 seconds)
- Maintain a rolling window of last 100 candles in memory for real-time prediction

---

### Phase 2: Pattern Detection Algorithm

#### 2.1 Create Edge Function: `predict-pocketoption-candle`
The core prediction engine using multiple techniques:

**Algorithm 1: Sequence Matching (Primary)**
```javascript
// Convert last N candles to direction sequence
const currentSequence = ["up", "up", "down", "up", "down"];

// Find all historical occurrences of this sequence
const matches = findHistoricalMatches(currentSequence, allCandles);

// Look at what happened AFTER each match
const nextCandleStats = {
  up: 34,   // 34 times the next candle was up
  down: 21  // 21 times the next candle was down
};

// Prediction: up with 62% confidence
```

**Algorithm 2: Cycle Detection**
```javascript
// Detect repeating cycles using autocorrelation
const cycleLength = detectCycle(last100Candles); // e.g., 13 candles

// Find position in current cycle
const cyclePosition = currentIndex % cycleLength;

// Predict based on historical cycle behavior at this position
const prediction = getCyclePrediction(cyclePosition, cycleLength);
```

**Algorithm 3: Markov Chain Transitions**
```javascript
// Build transition probability matrix
const transitions = {
  "up->up": 0.45,
  "up->down": 0.55,
  "down->up": 0.52,
  "down->down": 0.48
};

// Use last 3 candles as state
const state = "up-up-down";
const prediction = markovPredict(state, transitions);
```

**Final Prediction: Ensemble Voting**
```javascript
const predictions = [
  { method: "sequence", direction: "up", confidence: 62 },
  { method: "cycle", direction: "up", confidence: 71 },
  { method: "markov", direction: "down", confidence: 54 }
];

// Weighted vote favoring higher confidence
const finalPrediction = ensembleVote(predictions);
// Result: { direction: "up", confidence: 65, agreement: 2/3 }
```

#### 2.2 Pattern Fingerprinting
For fast matching across thousands of candles:

```javascript
// Convert candle sequence to binary fingerprint
// up=1, down=0
const fingerprint = candlesToBinary(["up", "down", "up", "up", "down"]);
// Result: 10110 (binary) = 22 (decimal)

// Store fingerprints with their "next candle" outcomes
// Query: Find all fingerprint=22, count next candle directions
```

---

### Phase 3: Real-Time Prediction UI

#### 3.1 Update PocketOptionPatternEngine Component

**New Features:**
- **Live Candle Feed** - Display incoming candles in real-time
- **Prediction Display** - Show next candle prediction with confidence
- **Countdown Timer** - Time until next candle closes
- **Accuracy Tracker** - Running accuracy of predictions

**Visual Design:**
```text
┌─────────────────────────────────────────────────────────────────┐
│  EUR/USD OTC  •  Connected                          Balance: $X │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ Last 10 Candles ─────────────────────────────────────────┐  │
│  │  ▲  ▼  ▲  ▲  ▼  ▼  ▲  ▼  ▲  ?                            │  │
│  │  +  -  +  +  -  -  +  -  +  NEXT                          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ PREDICTION ──────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │    ▲ CALL  (72% confidence)                               │  │
│  │                                                           │  │
│  │    Pattern: Sequence Match (5 of 7 historical matches)    │  │
│  │    Cycle: Position 8/13 (historically bullish)            │  │
│  │    Markov: 3-state suggests continuation                  │  │
│  │                                                           │  │
│  │    ⏱️ Next candle in: 0:42                                │  │
│  │                                                           │  │
│  │    [Execute Trade $10]  [Execute Trade $25]  [Skip]       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ Accuracy Stats ──────────────────────────────────────────┐  │
│  │  Today: 14/20 (70%)  │  Week: 89/134 (66%)  │  All: 73%   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Phase 4: Accuracy Tracking & Learning

#### 4.1 Create Table: `pocketoption_predictions`
Track every prediction to measure accuracy.

**Schema:**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | User reference |
| pair | VARCHAR | Currency pair |
| predicted_direction | VARCHAR | "up" or "down" |
| actual_direction | VARCHAR | Filled after candle closes |
| confidence | NUMERIC | Prediction confidence |
| prediction_method | VARCHAR | Which algorithm |
| was_correct | BOOLEAN | Filled after verification |
| predicted_at | TIMESTAMPTZ | When prediction was made |

#### 4.2 Accuracy Evaluation
After each candle closes:
1. Compare prediction to actual direction
2. Update `was_correct` field
3. Recalculate running accuracy metrics
4. Adjust algorithm weights based on performance

---

## Technical Architecture

```text
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   PocketOption  │────▶│  pocketoption-       │────▶│  Client         │
│   Platform      │     │  websocket           │     │  (Browser)      │
│   (WebSocket)   │◀────│  Edge Function       │◀────│                 │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
                                   │
                                   │ Store candles
                                   ▼
                        ┌──────────────────────┐
                        │  pocketoption_candles│
                        │  (Database)          │
                        └──────────────────────┘
                                   │
                                   │ Query patterns
                                   ▼
                        ┌──────────────────────┐
                        │  predict-pocketoption│
                        │  -candle             │
                        │  Edge Function       │
                        │                      │
                        │  • Sequence Matching │
                        │  • Cycle Detection   │
                        │  • Markov Chains     │
                        │  • Ensemble Voting   │
                        └──────────────────────┘
                                   │
                                   │ Return prediction
                                   ▼
                        ┌──────────────────────┐
                        │  Frontend            │
                        │  • Display prediction│
                        │  • Auto-execute trade│
                        │  • Track accuracy    │
                        └──────────────────────┘
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/predict-pocketoption-candle/index.ts` | Core prediction engine with ensemble algorithms |
| `src/components/PocketOptionPredictionPanel.tsx` | Real-time prediction UI component |
| `src/hooks/usePocketOptionCandles.ts` | Hook for candle collection and storage |

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/pocketoption-websocket/index.ts` | Parse and forward structured candle data |
| `src/hooks/usePocketOptionWebSocket.ts` | Add candle buffering and storage logic |
| `src/components/PocketOptionPatternEngine.tsx` | Integrate prediction panel, add accuracy display |
| `src/pages/PocketOption.tsx` | Add prediction tab to the page |

## Database Migrations

| Migration | Purpose |
|-----------|---------|
| `pocketoption_candles` table | Store historical candle data |
| `pocketoption_predictions` table | Track prediction accuracy |

---

## Summary

This prediction engine leverages the unique characteristic of OTC pairs (synthetic, repeating patterns) using:

1. **Sequence Matching** - Find identical historical patterns
2. **Cycle Detection** - Identify and exploit repeating cycles
3. **Markov Chains** - Probabilistic state transitions
4. **Ensemble Voting** - Combine methods for robust predictions

The system continuously learns from its predictions, tracking accuracy and adjusting algorithm weights to improve over time. Unlike the current placeholder implementation, this uses real candle data and proven pattern recognition techniques.
