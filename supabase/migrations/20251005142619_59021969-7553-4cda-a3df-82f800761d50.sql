-- Create paper trading accounts table
CREATE TABLE IF NOT EXISTS public.paper_trading_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance NUMERIC NOT NULL DEFAULT 100000.00,
  starting_balance NUMERIC NOT NULL DEFAULT 100000.00,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create paper trades table
CREATE TABLE IF NOT EXISTS public.paper_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.paper_trading_accounts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  total_value NUMERIC NOT NULL,
  profit_loss NUMERIC,
  notes TEXT,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create trading journal table
CREATE TABLE IF NOT EXISTS public.trading_journal (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES public.paper_trades(id) ON DELETE SET NULL,
  entry_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  symbol TEXT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('trade', 'observation', 'lesson', 'goal')),
  content TEXT NOT NULL,
  emotions TEXT[],
  ai_analysis TEXT,
  ai_suggestions TEXT[],
  analyzed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.paper_trading_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_journal ENABLE ROW LEVEL SECURITY;

-- RLS Policies for paper_trading_accounts
CREATE POLICY "Users can view own paper trading account"
  ON public.paper_trading_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own paper trading account"
  ON public.paper_trading_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own paper trading account"
  ON public.paper_trading_accounts FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for paper_trades
CREATE POLICY "Users can view own paper trades"
  ON public.paper_trades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own paper trades"
  ON public.paper_trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for trading_journal
CREATE POLICY "Users can view own journal entries"
  ON public.trading_journal FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own journal entries"
  ON public.trading_journal FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own journal entries"
  ON public.trading_journal FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own journal entries"
  ON public.trading_journal FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_paper_trading_accounts_user_id ON public.paper_trading_accounts(user_id);
CREATE INDEX idx_paper_trades_user_id ON public.paper_trades(user_id);
CREATE INDEX idx_paper_trades_account_id ON public.paper_trades(account_id);
CREATE INDEX idx_paper_trades_symbol ON public.paper_trades(symbol);
CREATE INDEX idx_trading_journal_user_id ON public.trading_journal(user_id);
CREATE INDEX idx_trading_journal_entry_date ON public.trading_journal(entry_date DESC);

-- Triggers for updated_at
CREATE TRIGGER update_paper_trading_accounts_updated_at
  BEFORE UPDATE ON public.paper_trading_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_trading_journal_updated_at
  BEFORE UPDATE ON public.trading_journal
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();