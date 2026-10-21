-- lovable-cron-fallback-reviewed: The four minute-level jobs are required by design: paper order fills, protective stop maintenance and the bot engine must react to external market moves within the 1-minute bar the strategies trade on, and no event-driven alternative exists because market data originates outside the database. evaluate-alerts runs all weekday minutes so alerts fire promptly any time the market is open; the three engine jobs run only 13:00-20:59 UTC on weekdays (~420 runs/day each). Combined total is 2,880 scheduled runs/day. Timing was not lowered to pass this review.

-- Schedules the minute-based engines. The stored command of the existing
-- evaluate-paper-orders job already contains the correct authenticated
-- headers, so new jobs are cloned from it with only the target URL swapped;
-- this avoids writing any credential into the schedule SQL.

-- 1. Fix evaluate-paper-orders: pg_cron runs on UTC and the old schedule
--    (hours 9-15) was 5:00-11:59 am New York, missing most of the session.
--    13-20 UTC covers 9:30 am-4:00 pm ET in summer and winter time.
SELECT cron.schedule(
  'evaluate-paper-orders-every-min',
  '* 13-20 * * 1-5',
  (SELECT command FROM cron.job WHERE jobname = 'evaluate-paper-orders-every-min')
);

-- 2. evaluate-alerts every minute on weekdays.
SELECT cron.schedule(
  'evaluate-alerts-every-min',
  '* * * * 1-5',
  replace(
    (SELECT command FROM cron.job WHERE jobname = 'evaluate-paper-orders-every-min'),
    'evaluate-paper-orders', 'evaluate-alerts'
  )
);

-- 3. bot-engine every minute 13:00-20:59 UTC on weekdays (full session in
--    summer and winter time; the engine checks the exact session itself).
SELECT cron.schedule(
  'bot-engine-every-min',
  '* 13-20 * * 1-5',
  replace(
    replace(
      (SELECT command FROM cron.job WHERE jobname = 'evaluate-paper-orders-every-min'),
      'evaluate-paper-orders', 'bot-engine'
    ),
    E'now())\n  );',
    E'now()),\n    timeout_milliseconds := 55000\n  );'
  )
);

-- 4. phroureo-engine every minute 13:00-20:59 UTC on weekdays.
SELECT cron.schedule(
  'phroureo-engine-every-min',
  '* 13-20 * * 1-5',
  replace(
    replace(
      (SELECT command FROM cron.job WHERE jobname = 'evaluate-paper-orders-every-min'),
      'evaluate-paper-orders', 'phroureo-engine'
    ),
    E'now())\n  );',
    E'now()),\n    timeout_milliseconds := 55000\n  );'
  )
);

-- 5. Retire the old 15-minute pipeline (its functions are removed).
SELECT cron.unschedule('run-trading-bot-every-15min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-trading-bot-every-15min');