-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the trading bot to run every 15 minutes during market hours (9:30 AM - 4:00 PM ET)
-- This runs Monday-Friday only
SELECT cron.schedule(
  'run-trading-bot-every-15min',
  '*/15 9-15 * * 1-5',
  $$
  SELECT
    net.http_post(
        url:='https://cxsfpxsbejzpukrdrulu.supabase.co/functions/v1/run-trading-bot',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4c2ZweHNiZWp6cHVrcmRydWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1Nzk3NjYsImV4cCI6MjA3NTE1NTc2Nn0.dljxiG8PHLGn_V5rpbzpBBTOeMgvlizPDCD6KBvqyC4"}'::jsonb,
        body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);