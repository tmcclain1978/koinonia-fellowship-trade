-- Add PocketOption credentials columns to user_api_credentials
ALTER TABLE public.user_api_credentials
ADD COLUMN IF NOT EXISTS pocketoption_api_key TEXT,
ADD COLUMN IF NOT EXISTS pocketoption_ssid TEXT;

-- Create table for PocketOption pattern tracking
CREATE TABLE IF NOT EXISTS public.pocketoption_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pair TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  confidence NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  predicted_direction TEXT NOT NULL CHECK (predicted_direction IN ('up', 'down')),
  predicted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accuracy_rate NUMERIC NOT NULL DEFAULT 0 CHECK (accuracy_rate >= 0 AND accuracy_rate <= 100),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.pocketoption_patterns ENABLE ROW LEVEL SECURITY;

-- Create policies for pocketoption_patterns
CREATE POLICY "Users can view own patterns"
  ON public.pocketoption_patterns
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own patterns"
  ON public.pocketoption_patterns
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own patterns"
  ON public.pocketoption_patterns
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own patterns"
  ON public.pocketoption_patterns
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_pocketoption_patterns_updated_at
  BEFORE UPDATE ON public.pocketoption_patterns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create table for PocketOption trade history
CREATE TABLE IF NOT EXISTS public.pocketoption_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pair TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down')),
  amount NUMERIC NOT NULL,
  duration INTEGER NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  profit_loss NUMERIC,
  pattern_id UUID REFERENCES public.pocketoption_patterns(id) ON DELETE SET NULL,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.pocketoption_trades ENABLE ROW LEVEL SECURITY;

-- Create policies for pocketoption_trades
CREATE POLICY "Users can view own trades"
  ON public.pocketoption_trades
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trades"
  ON public.pocketoption_trades
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update trades"
  ON public.pocketoption_trades
  FOR UPDATE
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);