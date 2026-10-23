-- Mirrors supabase/migrations/20261023180000_pocketoption_patterns.sql.

-- Pattern Engine: reliable candle storage, background collection, and
-- tracking how each pattern signal turned out.

-- PocketOption sends a tick count per candle.
ALTER TABLE public.pocketoption_candles ADD COLUMN IF NOT EXISTS volume numeric;

-- One row per candle: remove exact repeats saved by older versions, then
-- enforce it (lets the app and the collector save with "skip if present").
DELETE FROM public.pocketoption_candles a
  USING public.pocketoption_candles b
  WHERE a.user_id = b.user_id AND a.pair = b.pair AND a.timeframe = b.timeframe
    AND a."timestamp" = b."timestamp" AND a.ctid > b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS pocketoption_candles_user_pair_tf_ts_key
  ON public.pocketoption_candles (user_id, pair, timeframe, "timestamp");
GRANT ALL ON public.pocketoption_candles TO service_role;

-- Assets to keep collecting while the app is closed.
CREATE TABLE IF NOT EXISTS public.pocketoption_watch (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_candle_at timestamptz,
  last_count integer,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, asset)
);
ALTER TABLE public.pocketoption_watch ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own watch list" ON public.pocketoption_watch;
CREATE POLICY "Users manage own watch list" ON public.pocketoption_watch
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pocketoption_watch TO authenticated;
GRANT ALL ON public.pocketoption_watch TO service_role;

-- Pattern signals: what was seen, its track record at the time, and how it turned out.
ALTER TABLE public.pocketoption_patterns
  ADD COLUMN IF NOT EXISTS asset text,
  ADD COLUMN IF NOT EXISTS timeframe text NOT NULL DEFAULT '1m',
  ADD COLUMN IF NOT EXISTS candle_time timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_candles integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS entry_price numeric,
  ADD COLUMN IF NOT EXISTS exit_price numeric,
  ADD COLUMN IF NOT EXISTS outcome text CHECK (outcome IN ('win', 'loss', 'tie')),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS sample_size integer,
  ADD COLUMN IF NOT EXISTS win_rate numeric,
  ADD COLUMN IF NOT EXISTS details jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS pocketoption_patterns_signal_key
  ON public.pocketoption_patterns (user_id, asset, timeframe, pattern_type, candle_time, expiry_candles);
GRANT ALL ON public.pocketoption_patterns TO service_role;

-- Collect watched assets every 30 minutes (PocketOption keeps ~90 days, so
-- a missed run is filled in by the next one). Cloned from the existing
-- evaluate-paper-orders job command (it carries the auth headers).
SELECT cron.unschedule('collect-pocketoption-candles')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'collect-pocketoption-candles');
SELECT cron.schedule(
  'collect-pocketoption-candles',
  '7,37 * * * *',
  replace(
    (SELECT command FROM cron.job WHERE jobname = 'evaluate-paper-orders-every-min' LIMIT 1),
    'evaluate-paper-orders', 'collect-pocketoption-candles'
  )
);
