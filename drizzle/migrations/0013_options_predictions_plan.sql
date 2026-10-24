-- Mirrors supabase/migrations/20261024120000_options_predictions_plan.sql.

-- Options Signals: the partial-profit plan (sell half at 60% of the target,
-- stop to entry) and its result, plus the market context at the time.
ALTER TABLE public.options_predictions
  ADD COLUMN IF NOT EXISTS partial_price numeric,
  ADD COLUMN IF NOT EXISTS plan_r numeric,
  ADD COLUMN IF NOT EXISTS context jsonb;
