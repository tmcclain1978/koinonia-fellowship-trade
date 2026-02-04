-- Phroureo Exit Strategies Table
CREATE TABLE public.phroureo_exit_strategies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  position_id UUID,
  position_type TEXT NOT NULL DEFAULT 'paper' CHECK (position_type IN ('paper', 'live')),
  strategy_name TEXT NOT NULL DEFAULT 'Custom Exit Strategy',
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  entry_price NUMERIC NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'INACTIVE' CHECK (state IN ('INACTIVE', 'ARMED', 'TRIGGERED_STOP_SET', 'TRAILING_ACTIVE', 'COMPLETED')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Trigger Settings
  profit_trigger_type TEXT NOT NULL DEFAULT 'UNREALIZED_PL' CHECK (profit_trigger_type IN ('UNREALIZED_PL', 'REALIZED_PL', 'PRICE_LEVEL')),
  profit_trigger_value NUMERIC NOT NULL DEFAULT 50,
  profit_trigger_unit TEXT NOT NULL DEFAULT 'DOLLAR' CHECK (profit_trigger_unit IN ('DOLLAR', 'PERCENT')),
  trigger_once BOOLEAN NOT NULL DEFAULT true,
  
  -- Stop Set Settings
  stop_set_mode TEXT NOT NULL DEFAULT 'BREAKEVEN' CHECK (stop_set_mode IN ('BREAKEVEN', 'BREAKEVEN_PLUS', 'FIXED_PRICE', 'PERCENT_FROM_ENTRY', 'PERCENT_FROM_CURRENT', 'DOLLAR_FROM_ENTRY', 'ATR_MULTIPLE')),
  stop_set_value NUMERIC,
  stop_set_lock BOOLEAN NOT NULL DEFAULT true,
  stop_set_rounding TEXT NOT NULL DEFAULT 'TICK_SIZE' CHECK (stop_set_rounding IN ('TICK_SIZE', 'CENT', 'NONE')),
  
  -- Trailing Settings
  enable_trailing BOOLEAN NOT NULL DEFAULT false,
  trailing_type TEXT DEFAULT 'DOLLAR' CHECK (trailing_type IN ('DOLLAR', 'PERCENT')),
  trailing_amount NUMERIC,
  trail_step_type TEXT DEFAULT 'DOLLAR_STEP' CHECK (trail_step_type IN ('DOLLAR_STEP', 'PERCENT_STEP', 'TICK_STEP')),
  trail_step_value NUMERIC,
  trail_start_delay INTEGER,
  trail_reference TEXT DEFAULT 'HIGHEST_SINCE_TRIGGER' CHECK (trail_reference IN ('HIGHEST_SINCE_TRIGGER', 'HIGHEST_SINCE_ENTRY', 'CURRENT_PRICE')),
  trail_never_loosen BOOLEAN NOT NULL DEFAULT true,
  
  -- Safety Settings
  max_order_updates_per_minute INTEGER NOT NULL DEFAULT 10,
  allow_after_hours BOOLEAN NOT NULL DEFAULT false,
  slippage_buffer NUMERIC,
  
  -- Tracking
  current_stop_price NUMERIC,
  reference_price NUMERIC,
  triggered_at TIMESTAMP WITH TIME ZONE,
  last_update_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Phroureo Strategy Events (Audit Log)
CREATE TABLE public.phroureo_strategy_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  strategy_id UUID NOT NULL REFERENCES public.phroureo_exit_strategies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('STATE_CHANGE', 'STOP_UPDATE', 'TRIGGER_HIT', 'TRAIL_STEP', 'ERROR', 'MANUAL_EDIT', 'CREATED', 'PAUSED', 'RESUMED')),
  previous_state TEXT,
  new_state TEXT,
  previous_stop NUMERIC,
  new_stop NUMERIC,
  trigger_price NUMERIC,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.phroureo_exit_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phroureo_strategy_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for phroureo_exit_strategies
CREATE POLICY "Users can view their own exit strategies"
ON public.phroureo_exit_strategies
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own exit strategies"
ON public.phroureo_exit_strategies
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own exit strategies"
ON public.phroureo_exit_strategies
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exit strategies"
ON public.phroureo_exit_strategies
FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for phroureo_strategy_events (via strategy ownership)
CREATE POLICY "Users can view events for their strategies"
ON public.phroureo_strategy_events
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.phroureo_exit_strategies
  WHERE id = strategy_id AND user_id = auth.uid()
));

CREATE POLICY "Users can create events for their strategies"
ON public.phroureo_strategy_events
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.phroureo_exit_strategies
  WHERE id = strategy_id AND user_id = auth.uid()
));

-- Indexes for performance
CREATE INDEX idx_phroureo_strategies_user_id ON public.phroureo_exit_strategies(user_id);
CREATE INDEX idx_phroureo_strategies_position_id ON public.phroureo_exit_strategies(position_id);
CREATE INDEX idx_phroureo_strategies_state ON public.phroureo_exit_strategies(state);
CREATE INDEX idx_phroureo_strategies_enabled ON public.phroureo_exit_strategies(enabled);
CREATE INDEX idx_phroureo_events_strategy_id ON public.phroureo_strategy_events(strategy_id);
CREATE INDEX idx_phroureo_events_created_at ON public.phroureo_strategy_events(created_at);

-- Trigger for updated_at
CREATE TRIGGER update_phroureo_strategies_updated_at
BEFORE UPDATE ON public.phroureo_exit_strategies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.phroureo_exit_strategies;