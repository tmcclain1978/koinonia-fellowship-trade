
CREATE TABLE IF NOT EXISTS public.paper_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.paper_trading_accounts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  contract_key TEXT,
  multiplier NUMERIC NOT NULL DEFAULT 1,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  order_type TEXT NOT NULL CHECK (order_type IN ('market','limit','stop','stop_limit','trailing_stop')),
  quantity NUMERIC NOT NULL,
  limit_price NUMERIC,
  stop_price NUMERIC,
  trail_amount NUMERIC,
  trail_percent NUMERIC,
  watermark NUMERIC,
  stop_triggered BOOLEAN NOT NULL DEFAULT false,
  time_in_force TEXT NOT NULL DEFAULT 'DAY' CHECK (time_in_force IN ('DAY','GTC')),
  status TEXT NOT NULL DEFAULT 'working' CHECK (status IN ('working','pending_parent','filled','cancelled','rejected','expired')),
  oco_group UUID,
  parent_order_id UUID,
  notes TEXT,
  filled_price NUMERIC,
  filled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paper_orders TO authenticated;
GRANT ALL ON public.paper_orders TO service_role;

ALTER TABLE public.paper_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own paper orders"
  ON public.paper_orders FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_paper_orders_account_status ON public.paper_orders (account_id, status);
CREATE INDEX IF NOT EXISTS idx_paper_orders_status ON public.paper_orders (status);
CREATE INDEX IF NOT EXISTS idx_paper_orders_oco ON public.paper_orders (oco_group);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evaluate-paper-orders-every-min') THEN
    PERFORM cron.unschedule('evaluate-paper-orders-every-min');
  END IF;
END$$;

SELECT cron.schedule(
  'evaluate-paper-orders-every-min',
  '* 9-15 * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://cxsfpxsbejzpukrdrulu.supabase.co/functions/v1/evaluate-paper-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4c2ZweHNiZWp6cHVrcmRydWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1Nzk3NjYsImV4cCI6MjA3NTE1NTc2Nn0.dljxiG8PHLGn_V5rpbzpBBTOeMgvlizPDCD6KBvqyC4',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := jsonb_build_object('time', now())
  );
  $cron$
);
