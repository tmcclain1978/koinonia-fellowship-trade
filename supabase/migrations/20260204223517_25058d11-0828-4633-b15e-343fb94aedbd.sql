-- Create table for user exit strategy preferences
CREATE TABLE public.user_exit_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  -- Default Exit Strategy Settings
  default_stop_loss_enabled BOOLEAN DEFAULT false,
  default_stop_loss_type TEXT DEFAULT 'PERCENT' CHECK (default_stop_loss_type IN ('PERCENT', 'DOLLAR')),
  default_stop_loss_value NUMERIC DEFAULT 20,
  
  -- Trailing Stop Settings
  default_trailing_enabled BOOLEAN DEFAULT false,
  default_trailing_type TEXT DEFAULT 'PERCENT' CHECK (default_trailing_type IN ('PERCENT', 'DOLLAR')),
  default_trailing_value NUMERIC DEFAULT 10,
  
  -- Conditional Exit Presets (JSON for flexibility)
  saved_exit_presets JSONB DEFAULT '[]'::jsonb,
  
  -- Default Strategy Template
  default_phroureo_preset TEXT DEFAULT 'breakeven-lock',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_exit_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage their own preferences
CREATE POLICY "Users can manage their own exit preferences"
  ON public.user_exit_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_exit_preferences_updated_at
  BEFORE UPDATE ON public.user_exit_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for paper_trading_accounts (for live balance updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.paper_trading_accounts;