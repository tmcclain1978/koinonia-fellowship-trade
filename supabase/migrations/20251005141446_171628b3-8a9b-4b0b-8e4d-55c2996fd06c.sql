-- Create day trades log table for PTD tracking
CREATE TABLE public.day_trades_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  buy_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  sell_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  account_value NUMERIC NOT NULL,
  is_margin_account BOOLEAN NOT NULL DEFAULT true,
  broker TEXT NOT NULL DEFAULT 'schwab',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add index for faster queries on rolling window
CREATE INDEX idx_day_trades_user_sell ON public.day_trades_log(user_id, sell_timestamp DESC);

-- Enable RLS
ALTER TABLE public.day_trades_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own day trades
CREATE POLICY "Users can view own day trades"
ON public.day_trades_log
FOR SELECT
USING (auth.uid() = user_id);

-- Service role can insert day trades (from edge functions)
CREATE POLICY "Service role can insert day trades"
ON public.day_trades_log
FOR INSERT
WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Add account type tracking to user_api_credentials
ALTER TABLE public.user_api_credentials
ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'margin',
ADD COLUMN IF NOT EXISTS account_value NUMERIC DEFAULT 0;

-- Create function to count day trades in last 5 trading days
CREATE OR REPLACE FUNCTION public.count_recent_day_trades(
  _user_id UUID,
  _current_date TIMESTAMP WITH TIME ZONE DEFAULT now()
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trade_count INTEGER;
  trading_days_back INTEGER := 0;
  check_date TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Count day trades in last 5 trading days (excluding weekends)
  -- This is simplified - production would need market holiday calendar
  
  check_date := _current_date;
  
  -- Go back approximately 7 calendar days to cover 5 trading days
  -- (accounts for weekends, doesn't account for holidays yet)
  check_date := check_date - INTERVAL '7 days';
  
  SELECT COUNT(*)
  INTO trade_count
  FROM public.day_trades_log
  WHERE user_id = _user_id
    AND sell_timestamp >= check_date
    AND sell_timestamp <= _current_date;
    
  RETURN trade_count;
END;
$$;