-- Mirrors supabase/migrations/20261024010000_pocketoption_forecasts.sql.

-- Next-candle forecasts: which candle each prediction was for, so it can be
-- checked when that candle closes, and why it was made.
ALTER TABLE public.pocketoption_predictions
  ADD COLUMN IF NOT EXISTS candle_time timestamptz,
  ADD COLUMN IF NOT EXISTS timeframe text NOT NULL DEFAULT '1m',
  ADD COLUMN IF NOT EXISTS expiry_candles integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS p_up numeric,
  ADD COLUMN IF NOT EXISTS made_call boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS evidence jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS pocketoption_predictions_candle_key
  ON public.pocketoption_predictions (user_id, pair, timeframe, candle_time, expiry_candles);
GRANT ALL ON public.pocketoption_predictions TO service_role;
