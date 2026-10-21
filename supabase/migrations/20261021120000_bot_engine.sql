-- Trading bot engine: paper first, live through Robinhood once armed.
--
-- The old pipeline (run-trading-bot -> auto-trading-bot -> execute-trade)
-- never placed an order (execute-trade rejects the service key) and ran on
-- UTC hours (5:00-11:45 am New York). It is unscheduled here and replaced by
-- bot-engine, which runs every minute and manages trades end to end.

-- ---------------------------------------------------------------------------
-- Settings (one row per user, existing table)
-- ---------------------------------------------------------------------------
ALTER TABLE public.auto_trading_settings
  ADD COLUMN IF NOT EXISTS bot_mode text NOT NULL DEFAULT 'paper',
  ADD COLUMN IF NOT EXISTS live_armed_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flatten_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS risk_per_trade_pct numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS max_open_positions integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS reward_risk numeric NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS ai_confirm boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS breakeven_at_1r boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pdt_guard boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS paper_capital numeric NOT NULL DEFAULT 25000,
  ADD COLUMN IF NOT EXISTS slippage_bps numeric NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS engine_lock_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_scan_bar timestamptz,
  ADD COLUMN IF NOT EXISTS last_status text;

DO $$ BEGIN
  ALTER TABLE public.auto_trading_settings ADD CONSTRAINT auto_trading_settings_bot_mode_check CHECK (bot_mode IN ('paper', 'live'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.auto_trading_settings ADD CONSTRAINT auto_trading_settings_risk_check
    CHECK (risk_per_trade_pct > 0 AND risk_per_trade_pct <= 5 AND reward_risk >= 0.5 AND reward_risk <= 10
           AND max_open_positions BETWEEN 1 AND 20 AND paper_capital > 0 AND slippage_bps BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Trades the bot opened (paper and live)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bot_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('paper', 'live')),
  broker text NOT NULL,
  symbol text NOT NULL,
  -- entering: buy sent, not confirmed filled; open; exiting: sell sent;
  -- closed; cancelled: entry never filled; error: needs a human look.
  status text NOT NULL CHECK (status IN ('entering', 'open', 'exiting', 'closed', 'cancelled', 'error')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  signal_price numeric NOT NULL,
  entry_price numeric,
  initial_stop numeric NOT NULL,
  stop_price numeric NOT NULL,
  target_price numeric NOT NULL,
  entry_order_id text,
  stop_order_id text,
  exit_order_id text,
  exit_price numeric,
  exit_reason text,
  pnl numeric,
  r_multiple numeric,
  signal jsonb,
  ai_review jsonb,
  last_checked_at timestamptz,
  note text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  trade_date date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_trades_user_status ON public.bot_trades (user_id, mode, status);
CREATE INDEX IF NOT EXISTS idx_bot_trades_user_date ON public.bot_trades (user_id, mode, trade_date);

ALTER TABLE public.bot_trades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own bot trades" ON public.bot_trades;
CREATE POLICY "Users view own bot trades" ON public.bot_trades FOR SELECT USING (auth.uid() = user_id);
-- Writes only through the engine (service role).

-- ---------------------------------------------------------------------------
-- Decision log: every scan, signal, skip, veto, order and error
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bot_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL,
  kind text NOT NULL,
  symbol text,
  message text NOT NULL,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_events_user_time ON public.bot_events (user_id, created_at DESC);

ALTER TABLE public.bot_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own bot events" ON public.bot_events;
CREATE POLICY "Users view own bot events" ON public.bot_events FOR SELECT USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bot_trades') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_trades;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bot_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_events;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------------------
SELECT cron.unschedule('run-trading-bot-every-15min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-trading-bot-every-15min');

-- Every minute 13:00-20:59 UTC on weekdays covers 9:30 am - 4:00 pm New York
-- in summer and winter time; bot-engine checks the exact session (including
-- holidays and 1:00 pm early closes) itself.
SELECT cron.schedule(
  'bot-engine-every-min',
  '* 13-20 * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://cxsfpxsbejzpukrdrulu.supabase.co/functions/v1/bot-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4c2ZweHNiZWp6cHVrcmRydWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1Nzk3NjYsImV4cCI6MjA3NTE1NTc2Nn0.dljxiG8PHLGn_V5rpbzpBBTOeMgvlizPDCD6KBvqyC4',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := jsonb_build_object('time', now()),
    timeout_milliseconds := 55000
  );
  $cron$
);
