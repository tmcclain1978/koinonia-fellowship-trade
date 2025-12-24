-- Create price_alerts table
CREATE TABLE public.price_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('price_above', 'price_below', 'percent_change', 'volume_spike', 'rsi_overbought', 'rsi_oversold', 'macd_cross', 'sma_cross')),
  target_value NUMERIC NOT NULL,
  current_value NUMERIC,
  is_triggered BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  triggered_at TIMESTAMP WITH TIME ZONE,
  notification_sent BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create screener_presets table
CREATE TABLE public.screener_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN DEFAULT false,
  last_run_at TIMESTAMP WITH TIME ZONE,
  results_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create screener_results table for caching
CREATE TABLE public.screener_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  preset_id UUID REFERENCES public.screener_presets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  match_score NUMERIC DEFAULT 0,
  matched_conditions JSONB DEFAULT '[]'::jsonb,
  price NUMERIC,
  volume NUMERIC,
  change_percent NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screener_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screener_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for price_alerts
CREATE POLICY "Users can view own alerts" ON public.price_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own alerts" ON public.price_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own alerts" ON public.price_alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own alerts" ON public.price_alerts FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for screener_presets
CREATE POLICY "Users can view own presets" ON public.screener_presets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own presets" ON public.screener_presets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own presets" ON public.screener_presets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own presets" ON public.screener_presets FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for screener_results
CREATE POLICY "Users can view own results" ON public.screener_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own results" ON public.screener_results FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own results" ON public.screener_results FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_price_alerts_user_active ON public.price_alerts(user_id, is_active);
CREATE INDEX idx_price_alerts_symbol ON public.price_alerts(symbol);
CREATE INDEX idx_screener_presets_user ON public.screener_presets(user_id);
CREATE INDEX idx_screener_results_preset ON public.screener_results(preset_id);

-- Add triggers for updated_at
CREATE TRIGGER update_price_alerts_updated_at
  BEFORE UPDATE ON public.price_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_screener_presets_updated_at
  BEFORE UPDATE ON public.screener_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();