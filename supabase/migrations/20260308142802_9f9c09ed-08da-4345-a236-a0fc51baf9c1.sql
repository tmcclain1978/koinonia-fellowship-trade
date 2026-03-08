ALTER TABLE public.auto_trading_settings 
ADD COLUMN IF NOT EXISTS min_confidence_threshold integer DEFAULT 50;