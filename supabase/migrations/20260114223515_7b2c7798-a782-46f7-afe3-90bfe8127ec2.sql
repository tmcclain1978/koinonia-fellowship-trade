-- Create chart_annotations table for persistent annotations across devices
CREATE TABLE public.chart_annotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  price NUMERIC NOT NULL,
  text TEXT NOT NULL,
  annotation_type TEXT NOT NULL DEFAULT 'note',
  color TEXT NOT NULL DEFAULT '#f59e0b',
  chart_timestamp BIGINT,
  is_shared BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for faster queries
CREATE INDEX idx_chart_annotations_user_symbol ON public.chart_annotations(user_id, symbol);
CREATE INDEX idx_chart_annotations_shared ON public.chart_annotations(symbol, is_shared) WHERE is_shared = true;

-- Enable RLS
ALTER TABLE public.chart_annotations ENABLE ROW LEVEL SECURITY;

-- Users can view their own annotations
CREATE POLICY "Users can view their own annotations"
ON public.chart_annotations
FOR SELECT
USING (auth.uid() = user_id);

-- Users can view shared annotations for any symbol
CREATE POLICY "Users can view shared annotations"
ON public.chart_annotations
FOR SELECT
USING (is_shared = true);

-- Users can create their own annotations
CREATE POLICY "Users can create their own annotations"
ON public.chart_annotations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own annotations
CREATE POLICY "Users can update their own annotations"
ON public.chart_annotations
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own annotations
CREATE POLICY "Users can delete their own annotations"
ON public.chart_annotations
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_chart_annotations_updated_at
BEFORE UPDATE ON public.chart_annotations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();