-- Create table to log AI predictions and track accuracy
CREATE TABLE public.ai_prediction_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  predicted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Prediction data
  predicted_direction TEXT NOT NULL CHECK (predicted_direction IN ('bullish', 'bearish', 'neutral')),
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  predicted_high DECIMAL(12,2) NOT NULL,
  predicted_low DECIMAL(12,2) NOT NULL,
  key_level DECIMAL(12,2) NOT NULL,
  reasoning TEXT,
  
  -- Actual outcome (filled in after market close)
  actual_open DECIMAL(12,2),
  actual_high DECIMAL(12,2),
  actual_low DECIMAL(12,2),
  actual_close DECIMAL(12,2),
  
  -- Accuracy metrics (calculated after evaluation)
  direction_correct BOOLEAN,
  high_accuracy_pct DECIMAL(5,2), -- How close prediction was (100% = perfect)
  low_accuracy_pct DECIMAL(5,2),
  overall_score DECIMAL(5,2), -- Composite accuracy score
  
  -- Metadata
  evaluated_at TIMESTAMP WITH TIME ZONE,
  trading_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_prediction_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own predictions
CREATE POLICY "Users can view their own predictions"
ON public.ai_prediction_logs
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own predictions
CREATE POLICY "Users can create their own predictions"
ON public.ai_prediction_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own predictions (for evaluation)
CREATE POLICY "Users can update their own predictions"
ON public.ai_prediction_logs
FOR UPDATE
USING (auth.uid() = user_id);

-- Create index for efficient queries
CREATE INDEX idx_ai_predictions_user_date ON public.ai_prediction_logs(user_id, trading_date DESC);
CREATE INDEX idx_ai_predictions_symbol ON public.ai_prediction_logs(symbol, trading_date DESC);
CREATE INDEX idx_ai_predictions_evaluated ON public.ai_prediction_logs(user_id, evaluated_at) WHERE evaluated_at IS NULL;

-- Trigger for updated_at
CREATE TRIGGER update_ai_prediction_logs_updated_at
BEFORE UPDATE ON public.ai_prediction_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_prediction_logs;