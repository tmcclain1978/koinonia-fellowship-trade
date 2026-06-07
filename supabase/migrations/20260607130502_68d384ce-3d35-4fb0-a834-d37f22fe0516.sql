ALTER TABLE public.paper_trading_accounts
  ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.paper_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.paper_trading_accounts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  contract_key TEXT,
  multiplier NUMERIC NOT NULL DEFAULT 1,
  quantity NUMERIC NOT NULL,
  avg_cost NUMERIC NOT NULL,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_paper_position
  ON public.paper_positions (account_id, symbol, coalesce(contract_key, ''));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paper_positions TO authenticated;
GRANT ALL ON public.paper_positions TO service_role;

ALTER TABLE public.paper_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own paper positions"
  ON public.paper_positions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);