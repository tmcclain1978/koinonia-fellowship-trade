-- Create promo codes table
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('free_user', 'basic', 'pro', 'enterprise')),
  uses_remaining INTEGER,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage promo codes"
ON public.promo_codes
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active promo codes"
ON public.promo_codes
FOR SELECT
USING (
  (uses_remaining IS NULL OR uses_remaining > 0) AND
  (expires_at IS NULL OR expires_at > now())
);

-- Create usage tracking table
CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  period_start TIMESTAMP WITH TIME ZONE DEFAULT date_trunc('month', now()),
  period_end TIMESTAMP WITH TIME ZONE DEFAULT (date_trunc('month', now()) + interval '1 month'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, feature, period_start)
);

ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
ON public.usage_tracking
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all usage"
ON public.usage_tracking
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service can manage usage"
ON public.usage_tracking
FOR ALL
USING (true);

-- Create auto trading settings table
CREATE TABLE IF NOT EXISTS public.auto_trading_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  max_position_size NUMERIC,
  max_daily_trades INTEGER,
  risk_tolerance TEXT CHECK (risk_tolerance IN ('conservative', 'moderate', 'aggressive')),
  allowed_symbols TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.auto_trading_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own auto trading settings"
ON public.auto_trading_settings
FOR ALL
USING (auth.uid() = user_id);

-- Create auto trades log table
CREATE TABLE IF NOT EXISTS public.auto_trades_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  reasoning TEXT,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed', 'cancelled'))
);

ALTER TABLE public.auto_trades_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own auto trades"
ON public.auto_trades_log
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all auto trades"
ON public.auto_trades_log
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Update trigger for auto_trading_settings
CREATE TRIGGER update_auto_trading_settings_updated_at
BEFORE UPDATE ON public.auto_trading_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update trigger for usage_tracking
CREATE TRIGGER update_usage_tracking_updated_at
BEFORE UPDATE ON public.usage_tracking
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();