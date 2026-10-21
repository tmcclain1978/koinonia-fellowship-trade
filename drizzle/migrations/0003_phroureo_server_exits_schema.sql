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