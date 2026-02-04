
# Comprehensive Paper Trading Fix Plan

## Executive Summary

This plan addresses multiple critical issues with the paper trading system and adds new features for customizable exit strategies with persistent settings.

---

## Issues Identified

### 1. Incorrect P/L Calculation

**Root Cause Analysis:**
Looking at the `execute-paper-trade` edge function (line 55), the P/L calculation has a fundamental flaw:

```javascript
const totalValue = Number(quantity) * Number(price) * 100; // Always uses 100x multiplier
```

**Problem:** The code always multiplies by 100 (options contract multiplier), but this is incorrect when:
- The buy and sell prices are different contract counts
- The matching logic (lines 66-78) doesn't properly match options by strike/expiration, only by symbol
- The query finds the "most recent buy" regardless of whether it's for the same option contract

**Evidence from Database:**
```
sell: CALL 252.5 @ $0.57 -> profit_loss: -1050.33 (incorrect!)
sell: CALL 252.5 @ $0.27 -> profit_loss: -27.00
```
The first sell shows an absurdly wrong P/L of -$1050 because it matched against the wrong buy trade.

### 2. Account Balance Not Updating Correctly

**Root Cause:**
- The balance update logic (lines 81-89) is working, but:
  - The frontend doesn't refresh the account balance after trades
  - The `loadAccount()` function is called, but state updates may not reflect properly due to timing issues
  - No optimistic updates mean users see stale data

**Evidence:** Database shows `balance: 98930` vs `starting_balance: 100000`, so balance IS being updated in the database.

### 3. Missing Customizable Exit Strategy Persistence

**Root Cause:**
- The `ConditionalExitBuilder` component only stores state in React (lines 46-48), not in the database
- No table exists for storing user exit strategy preferences
- Changes are lost on page refresh

### 4. Stop Loss and Trailing Stop Not Persisted

**Root Cause:**
- While `phroureo_exit_strategies` table exists for position-specific strategies, there's no table for:
  - Default user preferences for stop loss
  - Trailing stop loss (money vs percentage preference)
  - These should persist as user defaults, not just per-position

---

## Solution Design

### Part 1: Fix P/L Calculation

**Changes to `supabase/functions/execute-paper-trade/index.ts`:**

1. **Match options contracts properly** by symbol + strike + side + expiration
2. **Track position-level data** for accurate average entry price
3. **Handle partial closes** correctly
4. **Detect stock vs options** trades (don't multiply by 100 for stocks)

**New P/L Logic:**
```typescript
// Match by exact contract specification
const { data: matchingBuys } = await supabase
  .from('paper_trades')
  .select('*')
  .eq('user_id', user.id)
  .eq('symbol', symbol)
  .eq('action', 'buy')
  .ilike('notes', `${side} ${strike}%`) // Match by contract type
  .order('executed_at', { ascending: true }); // FIFO

// Calculate weighted average entry price
let totalBoughtQty = 0;
let totalCost = 0;
for (const buy of matchingBuys) {
  totalBoughtQty += buy.quantity;
  totalCost += buy.price * buy.quantity;
}
const avgEntryPrice = totalCost / totalBoughtQty;

// Calculate P/L
const multiplier = isOptionsTrade ? 100 : 1;
profitLoss = (sellPrice - avgEntryPrice) * quantity * multiplier;
```

### Part 2: Fix Account Balance Updates

**Changes to Frontend:**

1. **Add optimistic updates** - Update UI immediately while API call runs
2. **Implement proper state refresh** - Use realtime subscriptions for balance changes
3. **Add loading states** - Show pending status during transactions

**Changes to `src/pages/PaperTrading.tsx`:**
```typescript
// Subscribe to balance changes
useEffect(() => {
  const channel = supabase
    .channel('paper-account-changes')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'paper_trading_accounts',
      filter: `user_id=eq.${user?.id}`,
    }, (payload) => {
      setAccount(payload.new);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [user?.id]);
```

### Part 3: Create User Exit Strategy Preferences Table

**New Database Table: `user_exit_preferences`**

```sql
CREATE TABLE public.user_exit_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Default Exit Strategy Settings
  default_stop_loss_enabled BOOLEAN DEFAULT false,
  default_stop_loss_type TEXT DEFAULT 'PERCENT', -- 'PERCENT' or 'DOLLAR'
  default_stop_loss_value NUMERIC DEFAULT 20,
  
  -- Trailing Stop Settings
  default_trailing_enabled BOOLEAN DEFAULT false,
  default_trailing_type TEXT DEFAULT 'PERCENT', -- 'PERCENT' or 'DOLLAR'
  default_trailing_value NUMERIC DEFAULT 10,
  
  -- Conditional Exit Presets (JSON for flexibility)
  saved_exit_presets JSONB DEFAULT '[]'::jsonb,
  
  -- Default Strategy Template
  default_phroureo_preset TEXT DEFAULT 'breakeven-lock',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_exit_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own preferences"
  ON public.user_exit_preferences
  FOR ALL
  USING (auth.uid() = user_id);
```

### Part 4: Update Conditional Exit Builder with Persistence

**Changes to `src/components/options/ConditionalExitBuilder.tsx`:**

1. **Load saved preferences** on component mount
2. **Save changes to database** when user modifies settings
3. **Add "Save as Default" button** for quick preference storage
4. **Support trailing stop type selection** (Dollar vs Percent)

**New UI Elements:**
```text
┌──────────────────────────────────────────────────────────────────┐
│ 📋 Conditional Exit Strategy                         [Toggle ON] │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Stop Loss:                                                      │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐              │
│  │ [x] Enabled │ │ Type: [$ ▼] │ │ Value: [50]  │              │
│  └─────────────┘ └──────────────┘ └──────────────┘              │
│                                                                  │
│  Trailing Stop:                                                  │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐              │
│  │ [x] Enabled │ │ Type: [% ▼] │ │ Value: [10]  │              │
│  └─────────────┘ └──────────────┘ └──────────────┘              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐      │
│  │ [Save as Default]        [Load Preset ▼]              │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                  │
│  My Saved Presets:                                               │
│  ├─ "Conservative 20% Stop"    [Apply] [Delete]                  │
│  └─ "Aggressive Trail"         [Apply] [Delete]                  │
└──────────────────────────────────────────────────────────────────┘
```

### Part 5: Create Exit Preferences Hook

**New File: `src/hooks/useExitPreferences.ts`**

```typescript
export function useExitPreferences() {
  const [preferences, setPreferences] = useState<ExitPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user preferences
  const loadPreferences = async () => { ... };
  
  // Save preferences
  const savePreferences = async (updates: Partial<ExitPreferences>) => { ... };
  
  // Save a new preset
  const savePreset = async (name: string, config: ExitCondition[]) => { ... };
  
  // Delete a preset
  const deletePreset = async (presetId: string) => { ... };
  
  return { preferences, loading, savePreferences, savePreset, deletePreset };
}
```

---

## Implementation Files

### Files to Modify

1. **`supabase/functions/execute-paper-trade/index.ts`**
   - Fix P/L calculation with proper contract matching
   - Add FIFO-based position tracking
   - Detect options vs stocks for correct multiplier

2. **`src/pages/PaperTrading.tsx`**
   - Add realtime subscription for balance updates
   - Implement optimistic updates on trade execution
   - Connect exit preferences to ConditionalExitBuilder

3. **`src/components/options/ConditionalExitBuilder.tsx`**
   - Add persistence layer for saved strategies
   - Add Dollar/Percent toggle for trailing stop
   - Add "Save as Default" functionality
   - Add preset management (save/load/delete)

### Files to Create

4. **`src/hooks/useExitPreferences.ts`**
   - Hook for managing user exit strategy preferences
   - CRUD operations for saved presets
   - Auto-load defaults on component mount

### Database Migration

5. **Create `user_exit_preferences` table**
   - Store default stop loss settings
   - Store trailing stop preferences (type + value)
   - Store saved exit presets as JSON
   - RLS policies for user isolation

---

## Technical Details

### P/L Calculation Fix

The core issue is in the matching logic. Current code:
```javascript
// WRONG: Matches ANY buy for the symbol
const { data: recentBuy } = await supabase
  .from('paper_trades')
  .select('*')
  .eq('symbol', symbol)
  .eq('action', 'buy')
  .order('executed_at', { ascending: false })
  .limit(1)
  .single();
```

Fixed code:
```javascript
// CORRECT: Match by complete contract specification
const contractKey = `${side} ${strike} ${expiration}`;

const { data: matchingBuys } = await supabase
  .from('paper_trades')
  .select('*')
  .eq('user_id', user.id)
  .eq('symbol', symbol)
  .eq('action', 'buy')
  .eq('notes', contractKey) // Exact match
  .order('executed_at', { ascending: true }); // FIFO

if (matchingBuys && matchingBuys.length > 0) {
  // Use weighted average entry price
  const totalQty = matchingBuys.reduce((sum, t) => sum + t.quantity, 0);
  const totalCost = matchingBuys.reduce((sum, t) => sum + (t.price * t.quantity), 0);
  const avgEntry = totalCost / totalQty;
  
  // Determine if options (has strike) or stock
  const isOptions = strike && strike !== '0';
  const multiplier = isOptions ? 100 : 1;
  
  profitLoss = (Number(price) - avgEntry) * Number(quantity) * multiplier;
}
```

### Balance Synchronization

Add realtime listener in PaperTrading.tsx:
```typescript
useEffect(() => {
  if (!user?.id) return;
  
  const channel = supabase
    .channel('paper-account')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'paper_trading_accounts',
      filter: `user_id=eq.${user.id}`,
    }, (payload) => {
      console.log('Balance updated:', payload.new.balance);
      setAccount(payload.new);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [user?.id]);
```

### Exit Preferences Schema

```typescript
interface ExitPreferences {
  id: string;
  user_id: string;
  default_stop_loss_enabled: boolean;
  default_stop_loss_type: 'PERCENT' | 'DOLLAR';
  default_stop_loss_value: number;
  default_trailing_enabled: boolean;
  default_trailing_type: 'PERCENT' | 'DOLLAR';
  default_trailing_value: number;
  saved_exit_presets: Array<{
    id: string;
    name: string;
    conditions: ExitCondition[];
    created_at: string;
  }>;
  default_phroureo_preset: string;
}
```

---

## Summary of Changes

| Component | Change | Impact |
|-----------|--------|--------|
| execute-paper-trade | Fix P/L matching logic | Accurate profit/loss calculations |
| execute-paper-trade | Add FIFO position tracking | Correct multi-lot averaging |
| PaperTrading.tsx | Add realtime balance subscription | Instant balance updates |
| ConditionalExitBuilder | Add persistence layer | Settings saved between sessions |
| ConditionalExitBuilder | Add Dollar/Percent toggle | User choice for trailing type |
| New: useExitPreferences | Hook for preference management | Reusable across components |
| New: user_exit_preferences | Database table | Persistent user defaults |

---

## Verification Checklist

After implementation, verify:

1. **P/L Accuracy**: Open a position, close it, verify P/L matches `(sell_price - buy_price) * qty * 100`
2. **Balance Updates**: Execute trade, verify balance changes immediately in UI
3. **Exit Strategy Persistence**: Set stop loss, refresh page, verify settings remain
4. **Trailing Stop Types**: Test both Dollar and Percent trailing stops
5. **Preset Management**: Save, load, and delete custom presets
6. **Multi-Position Handling**: Open multiple contracts, close some, verify correct FIFO accounting

