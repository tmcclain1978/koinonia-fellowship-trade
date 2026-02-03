-- Create table for storing PocketOption OTC candle data for pattern analysis
CREATE TABLE public.pocketoption_candles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pair VARCHAR(50) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('up', 'down', 'neutral')),
  timeframe VARCHAR(10) NOT NULL DEFAULT '1m',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for efficient pattern queries
CREATE INDEX idx_pocketoption_candles_pair_timestamp ON public.pocketoption_candles (pair, timestamp DESC);
CREATE INDEX idx_pocketoption_candles_user_pair ON public.pocketoption_candles (user_id, pair);
CREATE INDEX idx_pocketoption_candles_direction ON public.pocketoption_candles (pair, direction);

-- Enable RLS
ALTER TABLE public.pocketoption_candles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own candles"
  ON public.pocketoption_candles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own candles"
  ON public.pocketoption_candles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own candles"
  ON public.pocketoption_candles FOR DELETE
  USING (auth.uid() = user_id);

-- Create table for tracking predictions and accuracy
CREATE TABLE public.pocketoption_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pair VARCHAR(50) NOT NULL,
  predicted_direction VARCHAR(10) NOT NULL CHECK (predicted_direction IN ('up', 'down')),
  actual_direction VARCHAR(10) CHECK (actual_direction IN ('up', 'down', 'neutral')),
  confidence NUMERIC NOT NULL DEFAULT 50,
  prediction_method VARCHAR(50) NOT NULL,
  sequence_used TEXT,
  was_correct BOOLEAN,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for accuracy queries
CREATE INDEX idx_pocketoption_predictions_user ON public.pocketoption_predictions (user_id, predicted_at DESC);
CREATE INDEX idx_pocketoption_predictions_accuracy ON public.pocketoption_predictions (user_id, pair, was_correct);
CREATE INDEX idx_pocketoption_predictions_pending ON public.pocketoption_predictions (user_id) WHERE was_correct IS NULL;

-- Enable RLS
ALTER TABLE public.pocketoption_predictions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own predictions"
  ON public.pocketoption_predictions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own predictions"
  ON public.pocketoption_predictions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own predictions"
  ON public.pocketoption_predictions FOR UPDATE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_pocketoption_predictions_updated_at
  BEFORE UPDATE ON public.pocketoption_predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();