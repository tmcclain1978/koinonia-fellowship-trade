-- Store penny stock predictions for tracking and learning
CREATE TABLE public.penny_stock_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  prediction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Prediction outputs
  breakout_probability NUMERIC NOT NULL,
  confidence_rank TEXT CHECK (confidence_rank IN ('High', 'Moderate', 'Low')),
  predicted_direction TEXT CHECK (predicted_direction IN ('bullish', 'bearish', 'neutral')),
  
  -- Feature snapshot
  price_at_prediction NUMERIC,
  volume_at_prediction BIGINT,
  relative_volume NUMERIC,
  market_cap NUMERIC,
  float_shares NUMERIC,
  short_interest NUMERIC,
  
  -- Technical indicators
  rsi NUMERIC,
  vwap NUMERIC,
  sma_20 NUMERIC,
  momentum_5d NUMERIC,
  near_52w_high BOOLEAN DEFAULT false,
  pattern_detected TEXT,
  
  -- Sentiment
  news_sentiment_score NUMERIC,
  catalyst_type TEXT,
  catalyst_headline TEXT,
  
  -- AI explanation
  reasoning TEXT,
  key_factors JSONB DEFAULT '[]'::jsonb,
  risk_flags JSONB DEFAULT '[]'::jsonb,
  
  -- Outcome tracking
  actual_outcome TEXT,
  price_after_5d NUMERIC,
  max_gain_5d NUMERIC,
  was_accurate BOOLEAN,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(user_id, symbol, prediction_date)
);

-- User's saved penny stock watchlist
CREATE TABLE public.penny_stock_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notes TEXT,
  alert_enabled BOOLEAN DEFAULT false,
  
  UNIQUE(user_id, symbol)
);

-- Enable RLS
ALTER TABLE public.penny_stock_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penny_stock_watchlist ENABLE ROW LEVEL SECURITY;

-- Policies for predictions
CREATE POLICY "Users can view own predictions"
  ON public.penny_stock_predictions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own predictions"
  ON public.penny_stock_predictions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own predictions"
  ON public.penny_stock_predictions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own predictions"
  ON public.penny_stock_predictions FOR DELETE
  USING (auth.uid() = user_id);

-- Policies for watchlist
CREATE POLICY "Users can view own watchlist"
  ON public.penny_stock_watchlist FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watchlist"
  ON public.penny_stock_watchlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watchlist"
  ON public.penny_stock_watchlist FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own watchlist"
  ON public.penny_stock_watchlist FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime for watchlist
ALTER PUBLICATION supabase_realtime ADD TABLE public.penny_stock_watchlist;