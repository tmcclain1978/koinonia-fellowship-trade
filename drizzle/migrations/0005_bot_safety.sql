-- lovable-cron-fallback-reviewed: bot-watchdog runs every 5 minutes, 13:00-20:59 UTC on weekdays only (~96 runs/day). It must notice within minutes when the bot engine stops running during market hours while real-money positions may be open; no database event fires when a scheduled job silently stops, so a periodic check is the only way to detect it.

-- Mirrors supabase/migrations/20261021160000_bot_safety.sql.

ALTER TABLE public.auto_trading_settings ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true;
ALTER TABLE public.user_api_credentials ADD COLUMN IF NOT EXISTS schwab_refresh_issued_at timestamptz;

-- Live trading can only be switched on by the bot-control function. Users keep
-- editing their own settings, just not bot_mode / live_armed_at / engine state.
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

-- Watchdog: cloned from the existing evaluate-paper-orders job's command (it
-- already carries the authenticated headers), with only the target swapped.
SELECT cron.schedule(
  'bot-watchdog-every-5min',
  '*/5 13-20 * * 1-5',
  replace(
    (SELECT command FROM cron.job WHERE jobname = 'evaluate-paper-orders-every-min'),
    'evaluate-paper-orders', 'bot-watchdog'
  )
);
