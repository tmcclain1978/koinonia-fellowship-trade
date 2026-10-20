-- Alerts that actually fire: until now nothing evaluated price_alerts, so no
-- alert ever triggered. evaluate-alerts checks them every minute.

ALTER TABLE public.price_alerts
  ADD COLUMN IF NOT EXISTS condition jsonb,
  ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'once',
  ADD COLUMN IF NOT EXISTS cooldown_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_price numeric,
  ADD COLUMN IF NOT EXISTS trigger_message text,
  ADD COLUMN IF NOT EXISTS trigger_count integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.price_alerts ADD CONSTRAINT price_alerts_frequency_check CHECK (frequency IN ('once', 'repeat'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.price_alerts ADD CONSTRAINT price_alerts_cooldown_check CHECK (cooldown_minutes BETWEEN 1 AND 10080);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.price_alerts ADD CONSTRAINT price_alerts_condition_size CHECK (condition IS NULL OR pg_column_size(condition) <= 8192);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_price_alerts_eval ON public.price_alerts (is_active, is_triggered, symbol);

-- Every minute on weekdays; the function itself only works 4:00 am - 8:00 pm
-- New York time (pg_cron runs on UTC, so hours are not encoded here).
SELECT cron.schedule(
  'evaluate-alerts-every-min',
  '* * * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://cxsfpxsbejzpukrdrulu.supabase.co/functions/v1/evaluate-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4c2ZweHNiZWp6cHVrcmRydWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1Nzk3NjYsImV4cCI6MjA3NTE1NTc2Nn0.dljxiG8PHLGn_V5rpbzpBBTOeMgvlizPDCD6KBvqyC4',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := jsonb_build_object('time', now())
  );
  $cron$
);

-- Fix: pg_cron runs on UTC. The paper-order job was scheduled for hours 9-15,
-- which is 5:00 am - 11:59 am New York time, so paper orders were not
-- evaluated for most of the trading day. 13-20 UTC covers the full session in
-- both summer and winter time; the function now skips minutes outside
-- 9:30 am - 4:00 pm ET itself.
SELECT cron.schedule(
  'evaluate-paper-orders-every-min',
  '* 13-20 * * 1-5',
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

-- Realtime for alerts and notifications (the in-app "alert triggered" toast
-- listens for these; neither table was in the publication, so it never fired).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'price_alerts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.price_alerts;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
  END IF;
END $$;
