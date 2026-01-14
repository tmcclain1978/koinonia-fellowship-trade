-- Add chart_analysis column to trading_journal table
ALTER TABLE public.trading_journal 
ADD COLUMN chart_analysis text DEFAULT NULL;