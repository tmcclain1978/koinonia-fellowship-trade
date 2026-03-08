-- Phase 7.3: Database Optimization Indexes
-- Hot query paths: user_id + symbol, timestamps, status columns

-- auto_trades_log: frequently queried by user + symbol + time
CREATE INDEX IF NOT EXISTS idx_auto_trades_log_user_symbol ON public.auto_trades_log (user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_auto_trades_log_executed_at ON public.auto_trades_log (executed_at DESC);

-- ai_prediction_logs: queried by user + symbol + date
CREATE INDEX IF NOT EXISTS idx_ai_predictions_user_symbol ON public.ai_prediction_logs (user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_ai_predictions_trading_date ON public.ai_prediction_logs (trading_date DESC);

-- paper_trades: queried by user + account + time
CREATE INDEX IF NOT EXISTS idx_paper_trades_user_account ON public.paper_trades (user_id, account_id);
CREATE INDEX IF NOT EXISTS idx_paper_trades_executed_at ON public.paper_trades (executed_at DESC);

-- bot_sessions: queried by user + status
CREATE INDEX IF NOT EXISTS idx_bot_sessions_user_status ON public.bot_sessions (user_id, status);

-- bot_decisions: queried by session
CREATE INDEX IF NOT EXISTS idx_bot_decisions_session ON public.bot_decisions (session_id, created_at DESC);

-- pocketoption_candles: queried by user + pair + timeframe
CREATE INDEX IF NOT EXISTS idx_po_candles_user_pair ON public.pocketoption_candles (user_id, pair, timeframe);
CREATE INDEX IF NOT EXISTS idx_po_candles_timestamp ON public.pocketoption_candles ("timestamp" DESC);

-- penny_stock_predictions: queried by user + date
CREATE INDEX IF NOT EXISTS idx_penny_predictions_user_date ON public.penny_stock_predictions (user_id, prediction_date DESC);

-- price_alerts: active alerts queried frequently
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON public.price_alerts (user_id, is_active) WHERE is_active = true;

-- user_notifications: unread notifications
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.user_notifications (user_id, read) WHERE read = false;

-- service_status_history: queried by service + time
CREATE INDEX IF NOT EXISTS idx_status_history_service ON public.service_status_history (service_name, checked_at DESC);

-- trading_journal: queried by user + date
CREATE INDEX IF NOT EXISTS idx_trading_journal_user_date ON public.trading_journal (user_id, entry_date DESC);

-- phroureo_exit_strategies: active strategies
CREATE INDEX IF NOT EXISTS idx_phroureo_active ON public.phroureo_exit_strategies (user_id, enabled) WHERE enabled = true;

-- screener_results: queried by user + time
CREATE INDEX IF NOT EXISTS idx_screener_user_created ON public.screener_results (user_id, created_at DESC);