## Plan: Add "**Weekly Liquidity Sweep Model (WLSM)**" Tab to Backtesting Module

### Overview

Add a new tab called **"Weekly Liquidity Sweep Model (WLSM)"** to the existing BacktestingModule implementing the **Weekly Liquidity Sweep Model (WLSM)** -- a day-specific level-targeting backtester for SPY that tests whether Wednesday attacks Monday's range, Thursday attacks Tuesday's range, and Friday attacks Monday/Wednesday's range.

### Architecture

**1. New Component: `src/components/backtesting/WLSMBacktester.tsx**`
Self-contained component rendered inside a new tab in BacktestingModule. Contains:

- **Configuration Panel**: Symbol (default SPY), date range (1Y/3Y), test variant selector (high-only, low-only, either side, both sides, reversal after touch, continuation after touch, gap effect, VIX regime, FOMC/CPI weeks)
- **Weekly Level Engine**: Computes Mon/Tue/Wed highs and lows from daily candle data, tracks touched/untouched/swept/rejected status per week
- **Day-of-Week Bias Engine**: Maps Wed→Mon levels, Thu→Tue levels, Fri→Mon+Wed levels with priority ranking
- **Scoring Model**: Implements the 10-point scoring system (base +3 for untouched target on correct day, +2 ATR proximity, +2 trend alignment, etc., with penalties for gaps/news/exhaustion)
- **Results Dashboard**: 
  - Weekly level hit-rate statistics by day pair
  - Setup score distribution chart
  - Magnet continuation vs sweep-and-reject win rates
  - Equity curve for simulated trades
  - Summary metrics (total trades, win rate, avg R:R, profit factor, max drawdown)
- **Daily Panel Preview**: Shows current week's active levels, distances, statuses, and scores (live context)

**2. New Edge Function: `supabase/functions/wlsm-backtest/index.ts**`
Handles the heavy computation server-side:

- Fetches daily candle data for the requested period (reuses existing Polygon/Schwab fetching patterns from `fetch-schwab-candles`)
- Groups candles by week (Mon-Fri)
- For each week: identifies levels, checks which were touched/swept by subsequent days, applies context filters (20 EMA, ATR, VWAP proximity), scores setups, simulates trades with ATR-based stops and partial exits at target
- Returns structured results: per-week breakdown, aggregate statistics, equity curve, trade list

**3. Modify `src/components/BacktestingModule.tsx**`

- Add a 7th tab: `"Hi/Low Testing"` with a calendar-like icon
- Import and render `<WLSMBacktester />` inside that tab
- Update TabsList grid from `grid-cols-6` to `grid-cols-7`

**4. Database Migration**

- Create `wlsm_backtest_results` table to persist results:
  - `id`, `user_id`, `symbol`, `start_date`, `end_date`, `test_variant`, `results_json`, `created_at`
  - RLS policy: users can only read/write their own rows

### Test Variants (from user spec)

The backtest config will let users select which scenarios to test:

1. High touched only
2. Low touched only
3. Either side touched
4. Both sides touched
5. First side touched first
6. Reversal after touch
7. Continuation after touch
8. Effect of gap up/down
9. Effect of VIX regime
10. Effect of CPI/FOMC weeks

### Results Display

- **Summary cards**: Total setups found, hit rate by day, avg score, best/worst weeks
- **Charts**: Bar chart of hit rates by day-pair, equity curve, score distribution histogram
- **Trade table**: Scrollable list of individual setups with date, day, target level, direction, score, outcome, P&L
- **Weekly map view**: Visual grid showing each week's levels and which were swept/rejected

### Scope Notes

- Phase 1 only (dashboard + backtest). No live alerts or auto-trading in this build.
- Uses existing daily candle data sources (Polygon/Schwab APIs via the edge function).
- VWAP and intraday filters will use simplified daily-bar proxies for the backtest (true intraday VWAP requires minute data which can be added later).