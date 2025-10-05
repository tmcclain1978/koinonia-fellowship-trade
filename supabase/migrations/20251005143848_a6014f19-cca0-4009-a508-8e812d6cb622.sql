-- Create bot performance tracking and learning tables

-- Table to track bot performance metrics for learning
CREATE TABLE public.bot_performance_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  trade_id UUID REFERENCES public.auto_trades_log(id),
  
  -- Trade details
  symbol TEXT NOT NULL,
  strategy TEXT NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  quantity NUMERIC NOT NULL,
  
  -- Performance metrics
  pop_predicted NUMERIC, -- Probability of profit predicted
  pop_realized NUMERIC, -- Actual outcome (1 = win, 0 = loss)
  iv_rank_entry NUMERIC,
  iv_rank_exit NUMERIC,
  slippage NUMERIC,
  execution_quality_score NUMERIC,
  expected_rr NUMERIC, -- Expected reward/risk
  actual_rr NUMERIC, -- Actual reward/risk
  
  -- Learning metrics
  regime_classification TEXT, -- low_iv, high_iv, neutral
  regime_correct BOOLEAN,
  discipline_score NUMERIC, -- 0-1 score for following rules
  profit_factor NUMERIC,
  
  -- Timestamps
  trade_opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  trade_closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Table for daily learning insights
CREATE TABLE public.bot_learning_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  insight_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Daily metrics
  trades_analyzed INTEGER DEFAULT 0,
  iv_regime_accuracy NUMERIC, -- Target: 0.8
  avg_profit_factor NUMERIC,
  avg_discipline_score NUMERIC,
  avg_slippage NUMERIC,
  
  -- Learning insights (AI generated)
  key_insights TEXT[],
  strategy_adjustments TEXT,
  risk_observations TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, insight_date)
);

-- Table to track strategy performance over time
CREATE TABLE public.bot_strategy_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  strategy TEXT NOT NULL, -- bull_put_spread, iron_condor, etc.
  
  -- Performance stats
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  win_rate NUMERIC,
  avg_profit_factor NUMERIC,
  avg_slippage NUMERIC,
  total_pnl NUMERIC DEFAULT 0,
  
  -- Learning adjustments
  confidence_multiplier NUMERIC DEFAULT 1.0, -- Adjust based on performance
  enabled BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, strategy)
);

-- Enable RLS
ALTER TABLE public.bot_performance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_learning_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_strategy_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bot_performance_log
CREATE POLICY "Users can view own bot performance"
  ON public.bot_performance_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage bot performance"
  ON public.bot_performance_log FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- RLS Policies for bot_learning_insights
CREATE POLICY "Users can view own learning insights"
  ON public.bot_learning_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage learning insights"
  ON public.bot_learning_insights FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- RLS Policies for bot_strategy_stats
CREATE POLICY "Users can view own strategy stats"
  ON public.bot_strategy_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage strategy stats"
  ON public.bot_strategy_stats FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Indexes for performance
CREATE INDEX idx_bot_performance_user_id ON public.bot_performance_log(user_id);
CREATE INDEX idx_bot_performance_symbol ON public.bot_performance_log(symbol);
CREATE INDEX idx_bot_learning_user_date ON public.bot_learning_insights(user_id, insight_date);
CREATE INDEX idx_bot_strategy_user ON public.bot_strategy_stats(user_id, strategy);

-- Triggers for updated_at
CREATE TRIGGER update_bot_performance_updated_at
  BEFORE UPDATE ON public.bot_performance_log
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bot_learning_updated_at
  BEFORE UPDATE ON public.bot_learning_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bot_strategy_updated_at
  BEFORE UPDATE ON public.bot_strategy_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();