-- Add new columns to auto_trading_settings table
ALTER TABLE public.auto_trading_settings ADD COLUMN IF NOT EXISTS max_daily_loss DECIMAL DEFAULT 500;
ALTER TABLE public.auto_trading_settings ADD COLUMN IF NOT EXISTS max_weekly_loss DECIMAL DEFAULT 2000;
ALTER TABLE public.auto_trading_settings ADD COLUMN IF NOT EXISTS portfolio_stop_loss_percent DECIMAL DEFAULT 5;
ALTER TABLE public.auto_trading_settings ADD COLUMN IF NOT EXISTS max_session_trades INTEGER DEFAULT 10;

-- Create trade reviews table
CREATE TABLE IF NOT EXISTS public.trade_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  trade_id UUID,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('paper', 'live')),
  what_went_right TEXT,
  what_went_wrong TEXT,
  would_take_again BOOLEAN,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on trade_reviews
ALTER TABLE public.trade_reviews ENABLE ROW LEVEL SECURITY;

-- RLS policies for trade_reviews
CREATE POLICY "Users can view their own trade reviews"
ON public.trade_reviews FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own trade reviews"
ON public.trade_reviews FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trade reviews"
ON public.trade_reviews FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trade reviews"
ON public.trade_reviews FOR DELETE
USING (auth.uid() = user_id);

-- Create trading sessions table
CREATE TABLE IF NOT EXISTS public.trading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  trades_count INTEGER DEFAULT 0,
  session_pnl DECIMAL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on trading_sessions
ALTER TABLE public.trading_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for trading_sessions
CREATE POLICY "Users can view their own trading sessions"
ON public.trading_sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own trading sessions"
ON public.trading_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trading sessions"
ON public.trading_sessions FOR UPDATE
USING (auth.uid() = user_id);

-- Add updated_at triggers
CREATE TRIGGER update_trade_reviews_updated_at
BEFORE UPDATE ON public.trade_reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_trading_sessions_updated_at
BEFORE UPDATE ON public.trading_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();