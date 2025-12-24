-- Create backtest strategies table
CREATE TABLE public.backtest_strategies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  entry_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  exit_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  indicators JSONB NOT NULL DEFAULT '[]'::jsonb,
  position_sizing JSONB DEFAULT '{"type": "fixed", "value": 100}'::jsonb,
  stop_loss_percent NUMERIC,
  take_profit_percent NUMERIC,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create backtest results table
CREATE TABLE public.backtest_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  strategy_id UUID REFERENCES public.backtest_strategies(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '1D',
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  initial_capital NUMERIC NOT NULL DEFAULT 10000,
  final_capital NUMERIC,
  total_return_percent NUMERIC,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  win_rate NUMERIC,
  profit_factor NUMERIC,
  max_drawdown_percent NUMERIC,
  sharpe_ratio NUMERIC,
  sortino_ratio NUMERIC,
  avg_trade_return NUMERIC,
  avg_win NUMERIC,
  avg_loss NUMERIC,
  largest_win NUMERIC,
  largest_loss NUMERIC,
  avg_holding_period TEXT,
  trades JSONB DEFAULT '[]'::jsonb,
  equity_curve JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.backtest_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtest_results ENABLE ROW LEVEL SECURITY;

-- RLS policies for backtest_strategies
CREATE POLICY "Users can view own strategies" ON public.backtest_strategies
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own strategies" ON public.backtest_strategies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own strategies" ON public.backtest_strategies
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own strategies" ON public.backtest_strategies
  FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for backtest_results
CREATE POLICY "Users can view own results" ON public.backtest_results
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own results" ON public.backtest_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own results" ON public.backtest_results
  FOR DELETE USING (auth.uid() = user_id);

-- Add updated_at trigger for strategies
CREATE TRIGGER update_backtest_strategies_updated_at
  BEFORE UPDATE ON public.backtest_strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();