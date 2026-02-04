
# Phroureo Custom Exit Strategy System

## Overview

This plan implements a sophisticated exit automation system called "Phroureo" (Greek for "protection") that enables users to configure profit-triggered stop-loss adjustments with trailing stop capabilities for both paper trading and live trading.

## Architecture Summary

```text
+------------------+      +---------------------+      +------------------+
|   Trade Entry    |----->| Exit Strategy       |----->| Strategy Engine  |
|   (Pre-Trade)    |      | Configuration UI    |      | (Edge Function)  |
+------------------+      +---------------------+      +------------------+
                                   |                           |
                                   v                           v
                          +----------------+           +----------------+
                          | Open Position  |<--------->| Real-time      |
                          | Management     |           | Price Monitor  |
                          +----------------+           +----------------+
                                   |                           |
                                   v                           v
                          +----------------+           +----------------+
                          | Audit Log &    |           | Stop Order     |
                          | Event Tracking |           | Execution      |
                          +----------------+           +----------------+
```

## Database Schema

### New Tables

**1. `phroureo_exit_strategies`** - Main strategy configuration

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner reference |
| position_id | uuid | Linked paper_trades or live position ID |
| position_type | text | 'paper' or 'live' |
| strategy_name | text | User-defined name |
| symbol | text | Trading symbol |
| side | text | 'long' or 'short' |
| entry_price | numeric | Position entry price |
| quantity | integer | Position size |
| state | text | INACTIVE, ARMED, TRIGGERED_STOP_SET, TRAILING_ACTIVE, COMPLETED |
| enabled | boolean | Strategy active flag |
| --- Trigger Settings --- |
| profit_trigger_type | text | UNREALIZED_PL, REALIZED_PL, PRICE_LEVEL |
| profit_trigger_value | numeric | Threshold value |
| profit_trigger_unit | text | DOLLAR, PERCENT |
| trigger_once | boolean | Single vs multi-trigger mode |
| --- Stop Set Settings --- |
| stop_set_mode | text | BREAKEVEN, BREAKEVEN_PLUS, FIXED_PRICE, PERCENT_FROM_ENTRY, PERCENT_FROM_CURRENT, DOLLAR_FROM_ENTRY, ATR_MULTIPLE |
| stop_set_value | numeric | Mode-specific value |
| stop_set_lock | boolean | Never loosen stop flag |
| stop_set_rounding | text | TICK_SIZE, CENT, NONE |
| --- Trailing Settings --- |
| enable_trailing | boolean | Enable trailing stop |
| trailing_type | text | DOLLAR, PERCENT |
| trailing_amount | numeric | Trail distance |
| trail_step_type | text | DOLLAR_STEP, PERCENT_STEP, TICK_STEP |
| trail_step_value | numeric | Update increment |
| trail_start_delay | integer | Seconds delay (optional) |
| trail_reference | text | HIGHEST_SINCE_TRIGGER, HIGHEST_SINCE_ENTRY, CURRENT_PRICE |
| trail_never_loosen | boolean | Only tighten trail |
| --- Safety Settings --- |
| max_order_updates_per_minute | integer | Rate limit (default 10) |
| allow_after_hours | boolean | After-hours trading |
| slippage_buffer | numeric | Buffer for stop placement |
| --- Tracking --- |
| current_stop_price | numeric | Current effective stop |
| reference_price | numeric | High/low since trigger |
| triggered_at | timestamp | When trigger condition met |
| last_update_at | timestamp | Last stop adjustment |
| created_at | timestamp | Creation time |
| updated_at | timestamp | Last modification |

**2. `phroureo_strategy_events`** - Audit log

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| strategy_id | uuid | FK to exit_strategies |
| event_type | text | STATE_CHANGE, STOP_UPDATE, TRIGGER_HIT, TRAIL_STEP, ERROR, MANUAL_EDIT |
| previous_state | text | State before event |
| new_state | text | State after event |
| previous_stop | numeric | Stop before change |
| new_stop | numeric | Stop after change |
| trigger_price | numeric | Price that caused event |
| reason | text | Human-readable explanation |
| metadata | jsonb | Additional event data |
| created_at | timestamp | Event timestamp |

## Frontend Components

### 1. PhroureoStrategyBuilder (New Component)

Main configuration form with sections:

**A) Profit Trigger Section**
- Trigger type selector (Unrealized P/L, Realized P/L, Price Level)
- Value input with unit toggle ($ or %)
- Multi-trigger mode toggle

**B) Stop Set Section**
- Mode dropdown with all 7 options
- Dynamic value input based on mode
- Lock toggle (never loosen)
- Rounding preference

**C) Trailing Stop Section**
- Enable toggle
- Type selector (Dollar/Percent)
- Trail amount input
- Step configuration
- Reference point selector
- Start delay (optional)

**D) Safety Settings (Collapsible)**
- Rate limit adjustment
- After-hours toggle
- Slippage buffer

**E) Live Preview Panel**
- Dynamic text showing computed behavior
- Example: "At +$50 profit, stop moves to $102.50 (break-even + $0.05)"
- "Then trail by $0.25 updating every $0.10 move"
- Visual diagram for long/short logic

### 2. PhroureoPositionCard (New Component)

For each open position with strategy attached:
- Current state badge (Armed, Triggered, Trailing, etc.)
- Current stop price display
- Reference high/low tracking
- Pause/Resume/Edit/Delete buttons
- Collapsible audit log with timestamps

### 3. Integration Points

**Trade Entry (Pre-Trade)**
- Add "Phroureo Exit Strategy" collapsible section to:
  - `PaperOptionsOrderEntry.tsx`
  - `SchwabOptionsOrderEntry.tsx`
- Toggle to enable before trade execution
- Save strategy alongside trade

**Open Positions (Post-Trade)**
- Enhance `OpenPositions.tsx` with:
  - "Add Phroureo Strategy" button for positions without one
  - Strategy status badges
  - Edit strategy dialog trigger
  - Inline state machine visualization

## Backend Implementation

### Edge Function: `phroureo-strategy-engine`

Core processing function that:

1. **Monitors active strategies** via scheduled invocation (every 5 seconds)
2. **Fetches current prices** for all symbols with active strategies
3. **Evaluates state transitions** based on price data
4. **Executes stop order updates** through broker abstraction
5. **Logs all events** to audit table

**State Machine Logic:**

```text
                    ┌─────────────────────────────────────────┐
                    │                 INACTIVE                │
                    └─────────────────────────────────────────┘
                                        │
                            user enables strategy
                                        │
                                        v
                    ┌─────────────────────────────────────────┐
                    │                  ARMED                  │
                    │  (waiting for profit trigger)           │
                    └─────────────────────────────────────────┘
                                        │
                        profit >= trigger_value
                                        │
                                        v
                    ┌─────────────────────────────────────────┐
                    │           TRIGGERED_STOP_SET            │
                    │  (stop moved to configured level)       │
                    └─────────────────────────────────────────┘
                                        │
                        enable_trailing = true
                                        │
                                        v
                    ┌─────────────────────────────────────────┐
                    │            TRAILING_ACTIVE              │
                    │  (stop follows price by trail_amount)   │
                    └─────────────────────────────────────────┘
                                        │
                    position closed OR strategy disabled
                                        │
                                        v
                    ┌─────────────────────────────────────────┐
                    │               COMPLETED                 │
                    └─────────────────────────────────────────┘
```

**Stop Price Calculation (Long Position):**

```javascript
// On trigger hit
switch (stop_set_mode) {
  case 'BREAKEVEN':
    newStop = entryPrice;
    break;
  case 'BREAKEVEN_PLUS':
    newStop = entryPrice + stop_set_value;
    break;
  case 'FIXED_PRICE':
    newStop = stop_set_value;
    break;
  case 'PERCENT_FROM_ENTRY':
    newStop = entryPrice * (1 - stop_set_value / 100);
    break;
  case 'PERCENT_FROM_CURRENT':
    newStop = currentPrice * (1 - stop_set_value / 100);
    break;
  case 'DOLLAR_FROM_ENTRY':
    newStop = entryPrice - stop_set_value;
    break;
  case 'ATR_MULTIPLE':
    newStop = currentPrice - (atr * stop_set_value);
    break;
}

// Apply lock (never loosen)
if (stop_set_lock && newStop < currentStop) {
  newStop = currentStop;
}
```

**Trailing Logic (Long Position):**

```javascript
// On each price update
if (currentPrice > referenceHigh) {
  referenceHigh = currentPrice;
}

const idealStop = referenceHigh - trailingAmount;

// Only update if moved by step amount
const priceMoved = referenceHigh - lastReferenceHigh;
if (priceMoved >= trailStepValue) {
  if (trail_never_loosen) {
    newStop = Math.max(currentStop, idealStop);
  } else {
    newStop = idealStop;
  }
  // Apply rounding
  newStop = applyRounding(newStop, stop_set_rounding);
  // Update stop order
  await updateStopOrder(newStop);
}
```

### API Endpoints (Edge Functions)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `phroureo-strategy` | POST | Create strategy |
| `phroureo-strategy` | PUT | Update strategy |
| `phroureo-strategy` | DELETE | Delete strategy |
| `phroureo-strategy/pause` | POST | Pause strategy |
| `phroureo-strategy/resume` | POST | Resume strategy |
| `phroureo-strategy` | GET | Get strategy by ID |
| `phroureo-strategy/events` | GET | Get audit log |
| `phroureo-engine` | POST | Main processing (cron) |

## Presets

Built-in strategy templates:

1. **Break-Even Lock** - Move stop to break-even at +$50, no trailing
2. **Trail from Break-Even** - Break-even at +$25, then trail by 0.5%
3. **Aggressive Trail** - Break-even + $0.10 at +$30, trail by $0.15 every $0.05
4. **ATR-Based Protection** - 1.5x ATR stop, trail by 1x ATR
5. **Percentage Scalp** - 2% profit trigger, break-even, trail by 0.3%

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `src/components/phroureo/PhroureoStrategyBuilder.tsx` | Main configuration UI |
| `src/components/phroureo/PhroureoPositionCard.tsx` | Position management card |
| `src/components/phroureo/PhroureoPreview.tsx` | Live strategy preview |
| `src/components/phroureo/PhroureoAuditLog.tsx` | Event history display |
| `src/components/phroureo/phroureoTypes.ts` | TypeScript interfaces |
| `src/components/phroureo/phroureoPresets.ts` | Preset configurations |
| `src/hooks/usePhroureoStrategy.ts` | Strategy state management |
| `supabase/functions/phroureo-strategy/index.ts` | CRUD operations |
| `supabase/functions/phroureo-engine/index.ts` | Processing engine |

### Modified Files

| File | Changes |
|------|---------|
| `src/components/OpenPositions.tsx` | Add Phroureo integration |
| `src/components/options/PaperOptionsOrderEntry.tsx` | Add pre-trade strategy section |
| `src/components/options/SchwabOptionsOrderEntry.tsx` | Add pre-trade strategy section |
| `src/pages/PaperTrading.tsx` | Import Phroureo components |
| `src/pages/Trading.tsx` | Import Phroureo components |
| `src/integrations/supabase/types.ts` | Auto-updated with new tables |

### Database Migration

New migration file for:
- Create `phroureo_exit_strategies` table
- Create `phroureo_strategy_events` table
- Add RLS policies for both tables
- Create indexes for performance
- Enable realtime for live updates

## Edge Case Handling

1. **Partial Fills**: Recalculate based on remaining position size
2. **Broker Rejection**: Log error, show retry option, maintain current stop
3. **Price Gaps**: Compute appropriate stop at next available price
4. **Network Disconnect**: Reconcile on reconnect by comparing stored state vs broker orders
5. **Existing Manual Stop**: Prompt user to adopt, leave, or replace

## Security Considerations

- RLS policies restrict strategy access to owner only
- No secrets stored in logs (only trade IDs and calculated values)
- Rate limiting prevents order spam
- All stop prices validated before execution

## Testing Plan

1. Unit tests for stop calculation (long and short positions)
2. Unit tests for trailing step logic
3. Integration tests for state machine transitions
4. Mock broker adapter responses for order management
5. Rate limit verification tests

## Implementation Phases

**Phase 1: Database & Types** (This session)
- Create migration with tables
- Define TypeScript interfaces

**Phase 2: Core UI Components** (This session)
- PhroureoStrategyBuilder
- PhroureoPreview
- Presets

**Phase 3: Backend Engine** (This session)
- CRUD edge function
- Processing engine edge function

**Phase 4: Integration** (This session)
- Connect to OpenPositions
- Add to order entry forms
- Position card with audit log

**Phase 5: Testing & Polish** (Follow-up)
- Edge case handling
- Error states
- UI polish
