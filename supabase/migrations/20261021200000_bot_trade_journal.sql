-- Bot trades recorded in the Trading Journal.

-- Bot trades in the Trading Journal: each filled bot trade gets one entry,
-- linked here and tagged "bot" + "paper"/"live". (trade_id only links paper
-- order fills, so bot trades need their own link.)
ALTER TABLE public.trading_journal
  ADD COLUMN IF NOT EXISTS bot_trade_id uuid REFERENCES public.bot_trades(id) ON DELETE SET NULL;

-- One entry per bot trade (lets the bot update the same entry when the trade closes).
CREATE UNIQUE INDEX IF NOT EXISTS trading_journal_bot_trade_id_key ON public.trading_journal (bot_trade_id);

-- Trades the bot already made: add them now (later updates come from the bot).
INSERT INTO public.trading_journal (user_id, bot_trade_id, entry_type, symbol, content, tags, entry_date)
SELECT
  t.user_id,
  t.id,
  'trade',
  t.symbol,
  '🤖 Bot trade · ' || CASE WHEN t.mode = 'live' THEN 'LIVE money' ELSE 'paper' END || ' · ' || t.broker || E'\n'
    || 'Bought ' || t.quantity || ' ' || t.symbol || ' @ $' || to_char(t.entry_price, 'FM999999990.00') || '.'
    || E'\nPlan: stop $' || to_char(t.initial_stop, 'FM999999990.00') || ', target $' || to_char(t.target_price, 'FM999999990.00') || '.'
    || CASE
         WHEN t.status = 'closed' AND t.exit_price IS NOT NULL THEN
           E'\nSold @ $' || to_char(t.exit_price, 'FM999999990.00') || ' (' || coalesce(replace(t.exit_reason, '_', ' '), 'closed') || ').'
           || ' Result ' || CASE WHEN coalesce(t.pnl, 0) >= 0 THEN '+' ELSE '−' END || '$' || to_char(abs(coalesce(t.pnl, 0)), 'FM999999990.00') || '.'
         WHEN t.status = 'error' THEN E'\n⚠ Needs attention: ' || coalesce(t.note, 'the bot stopped managing this trade') || '.'
         ELSE E'\nStill open.'
       END
    || E'\n\n— Your notes —\n',
  ARRAY[
    'bot',
    CASE WHEN t.mode = 'live' THEN 'live' ELSE 'paper' END,
    CASE
      WHEN t.status = 'closed' THEN CASE WHEN coalesce(t.pnl, 0) >= 0 THEN 'win' ELSE 'loss' END
      WHEN t.status = 'error' THEN 'needs-attention'
      ELSE 'open'
    END
  ],
  t.opened_at
FROM public.bot_trades t
WHERE t.entry_price > 0
ON CONFLICT (bot_trade_id) DO NOTHING;
