CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('run-trading-bot-every-15min')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'run-trading-bot-every-15min'
);

SELECT cron.schedule(
  'run-trading-bot-every-15min',
  '*/15 9-15 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://cxsfpxsbejzpukrdrulu.supabase.co/functions/v1/run-trading-bot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4c2ZweHNiZWp6cHVrcmRydWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1Nzk3NjYsImV4cCI6MjA3NTE1NTc2Nn0.dljxiG8PHLGn_V5rpbzpBBTOeMgvlizPDCD6KBvqyC4',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := jsonb_build_object('time', now())
  );
  $$
);