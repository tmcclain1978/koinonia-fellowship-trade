-- Add tags column to trading_journal table for custom categorization
ALTER TABLE public.trading_journal 
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT NULL;

-- Create an index for faster tag-based searches
CREATE INDEX IF NOT EXISTS idx_trading_journal_tags ON public.trading_journal USING GIN(tags);