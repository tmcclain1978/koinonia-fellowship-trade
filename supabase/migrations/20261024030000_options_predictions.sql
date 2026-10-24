-- Options Signals: each prediction (same day or swing), the suggested
-- contract, and how it turned out.
CREATE TABLE IF NOT EXISTS public.options_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('sameday', 'swing')),
  direction text NOT NULL CHECK (direction IN ('up', 'down')),
  signal_at timestamptz NOT NULL,
  deadline timestamptz NOT NULL,
  entry_price numeric NOT NULL,
  target_price numeric NOT NULL,
  stop_price numeric NOT NULL,
  atr numeric,
  chance numeric,
  baseline numeric,
  strength text,
  reason text,
  evidence jsonb,
  contract jsonb,
  outcome text CHECK (outcome IN ('win', 'loss', 'expired')),
  exit_price numeric,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol, mode, signal_at)
);
CREATE INDEX IF NOT EXISTS options_predictions_user_time ON public.options_predictions (user_id, signal_at DESC);
ALTER TABLE public.options_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own option predictions" ON public.options_predictions;
CREATE POLICY "Users manage own option predictions" ON public.options_predictions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.options_predictions TO authenticated;
GRANT ALL ON public.options_predictions TO service_role;
