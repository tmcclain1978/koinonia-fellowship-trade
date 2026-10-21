-- Bot safety: notifications, watchdog, Schwab login age, and server-only
-- switches for live trading.

ALTER TABLE public.auto_trading_settings ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true;
ALTER TABLE public.user_api_credentials ADD COLUMN IF NOT EXISTS schwab_refresh_issued_at timestamptz;

-- ---------------------------------------------------------------------------
-- Live trading can only be switched on by the bot-control function (which
-- checks the plan, the Robinhood connection and a recent passing check).
-- Users keep editing their own settings, just not these columns.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE ON public.auto_trading_settings FROM authenticated, anon;
GRANT INSERT (user_id, enabled, max_position_size, max_daily_trades, risk_tolerance, allowed_symbols,
              max_daily_loss, max_weekly_loss, portfolio_stop_loss_percent, max_session_trades,
              min_confidence_threshold, paused, flatten_requested_at, risk_per_trade_pct, max_open_positions,
              reward_risk, ai_confirm, breakeven_at_1r, pdt_guard, paper_capital, slippage_bps, notify_email)
  ON public.auto_trading_settings TO authenticated;
-- user_id is listed because upserts SET every column they send; RLS still pins it to the caller.
GRANT UPDATE (user_id, enabled, max_position_size, max_daily_trades, risk_tolerance, allowed_symbols,
              max_daily_loss, max_weekly_loss, portfolio_stop_loss_percent, max_session_trades,
              min_confidence_threshold, paused, flatten_requested_at, risk_per_trade_pct, max_open_positions,
              reward_risk, ai_confirm, breakeven_at_1r, pdt_guard, paper_capital, slippage_bps, notify_email, updated_at)
  ON public.auto_trading_settings TO authenticated;

-- The "Robinhood check passed" record lives in metadata; only the server writes it.
REVOKE INSERT, UPDATE ON public.mcp_connections FROM authenticated, anon;
GRANT INSERT (user_id, provider, server_url, state, scope_mode, access_token_enc, refresh_token_enc, token_expires_at,
              client_id, client_secret_enc, authorization_endpoint, token_endpoint, registration_endpoint,
              pkce_verifier_enc, oauth_state, redirect_uri, last_error)
  ON public.mcp_connections TO authenticated;
GRANT UPDATE (user_id, provider, server_url, state, scope_mode, access_token_enc, refresh_token_enc, token_expires_at,
              client_id, client_secret_enc, authorization_endpoint, token_endpoint, registration_endpoint,
              pkce_verifier_enc, oauth_state, redirect_uri, last_error, updated_at)
  ON public.mcp_connections TO authenticated;

-- ---------------------------------------------------------------------------
-- Watchdog every 5 minutes on weekdays (13:00-20:59 UTC covers the session).
-- ---------------------------------------------------------------------------
SELECT cron.unschedule('bot-watchdog-every-5min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bot-watchdog-every-5min');

SELECT cron.schedule(
  'bot-watchdog-every-5min',
  '*/5 13-20 * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://cxsfpxsbejzpukrdrulu.supabase.co/functions/v1/bot-watchdog',
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
