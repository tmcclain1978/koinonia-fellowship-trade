-- Add enhanced tracking columns to bot_performance_log
ALTER TABLE public.bot_performance_log 
ADD COLUMN IF NOT EXISTS koinonia_signal_used boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS chart_analysis_used boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS live_price_at_entry numeric,
ADD COLUMN IF NOT EXISTS screener_match_score numeric,
ADD COLUMN IF NOT EXISTS patterns_detected text[],
ADD COLUMN IF NOT EXISTS sentiment_at_entry text,
ADD COLUMN IF NOT EXISTS confidence_breakdown jsonb,
ADD COLUMN IF NOT EXISTS analysis_sources text[];

-- Add index for performance queries
CREATE INDEX IF NOT EXISTS idx_bot_performance_confidence ON public.bot_performance_log(discipline_score DESC);
CREATE INDEX IF NOT EXISTS idx_bot_performance_koinonia ON public.bot_performance_log(koinonia_signal_used) WHERE koinonia_signal_used = true;