-- Phroureo exit strategies run on the server every minute and keep a real
-- (paper) stop order in step with the strategy's stop. Before this nothing ran
-- them, so the protection they promised never happened.

ALTER TABLE public.phroureo_exit_strategies
  ADD COLUMN IF NOT EXISTS contract_key text,
  ADD COLUMN IF NOT EXISTS multiplier numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS paper_order_id uuid REFERENCES public.paper_orders(id) ON DELETE SET NULL;

-- Strategies created before this (from the paper options page) were for
-- option positions; their entry price is the option premium. Without the
-- contract they can't be priced safely, so pause them and say why.
WITH paused AS (
  UPDATE public.phroureo_exit_strategies
  SET enabled = false
  WHERE contract_key IS NULL AND enabled = true AND state IN ('ARMED', 'TRIGGERED_STOP_SET', 'TRAILING_ACTIVE')
  RETURNING id
)
INSERT INTO public.phroureo_strategy_events (strategy_id, event_type, reason)
SELECT id, 'PAUSED', 'Paused during an upgrade: please recreate this protection from the position so it is tied to the exact contract.'
FROM paused;

SELECT cron.unschedule('phroureo-engine-every-min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'phroureo-engine-every-min');

-- 13:00-20:59 UTC covers the regular session in summer and winter time; the
-- function itself only acts between 9:30 am and 4:00 pm New York time.
SELECT cron.schedule(
  'phroureo-engine-every-min',
  '* 13-20 * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://cxsfpxsbejzpukrdrulu.supabase.co/functions/v1/phroureo-engine',
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
