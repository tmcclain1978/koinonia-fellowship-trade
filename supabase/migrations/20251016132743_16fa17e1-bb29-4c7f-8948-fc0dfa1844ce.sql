-- Create bot sessions table to track each bot run
CREATE TABLE IF NOT EXISTS public.bot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL CHECK (status IN ('running', 'stopped', 'error')),
  mode TEXT NOT NULL CHECK (mode IN ('paper', 'live')),
  total_trades INTEGER DEFAULT 0,
  successful_trades INTEGER DEFAULT 0,
  failed_trades INTEGER DEFAULT 0,
  total_pnl DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create bot decisions table to track AI analysis and decisions
CREATE TABLE IF NOT EXISTS public.bot_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.bot_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  decision_type TEXT NOT NULL CHECK (decision_type IN ('buy', 'sell', 'hold', 'close')),
  confidence DECIMAL(5, 2), -- AI confidence score 0-100
  reasoning TEXT,
  analysis_data JSONB, -- Full AI analysis response
  executed BOOLEAN DEFAULT FALSE,
  executed_at TIMESTAMP WITH TIME ZONE,
  execution_result JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create bot performance metrics table
CREATE TABLE IF NOT EXISTS public.bot_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.bot_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  portfolio_value DECIMAL(12, 2),
  cash_balance DECIMAL(12, 2),
  positions_count INTEGER,
  daily_pnl DECIMAL(10, 2),
  total_pnl DECIMAL(10, 2),
  win_rate DECIMAL(5, 2),
  metrics JSONB, -- Additional metrics (sharpe ratio, max drawdown, etc.)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_performance_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bot_sessions
CREATE POLICY "Users can view their own bot sessions"
  ON public.bot_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bot sessions"
  ON public.bot_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bot sessions"
  ON public.bot_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for bot_decisions
CREATE POLICY "Users can view their own bot decisions"
  ON public.bot_decisions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bot decisions"
  ON public.bot_decisions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bot decisions"
  ON public.bot_decisions FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for bot_performance_metrics
CREATE POLICY "Users can view their own bot performance metrics"
  ON public.bot_performance_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bot performance metrics"
  ON public.bot_performance_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX idx_bot_sessions_user_id ON public.bot_sessions(user_id);
CREATE INDEX idx_bot_sessions_status ON public.bot_sessions(status);
CREATE INDEX idx_bot_decisions_session_id ON public.bot_decisions(session_id);
CREATE INDEX idx_bot_decisions_user_id ON public.bot_decisions(user_id);
CREATE INDEX idx_bot_decisions_created_at ON public.bot_decisions(created_at DESC);
CREATE INDEX idx_bot_performance_metrics_session_id ON public.bot_performance_metrics(session_id);
CREATE INDEX idx_bot_performance_metrics_user_id ON public.bot_performance_metrics(user_id);

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_decisions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_performance_metrics;

-- Create trigger for updated_at
CREATE TRIGGER update_bot_sessions_updated_at
  BEFORE UPDATE ON public.bot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();