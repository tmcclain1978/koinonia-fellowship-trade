CREATE TABLE public.wlsm_backtest_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL DEFAULT 'SPY',
  start_date date NOT NULL,
  end_date date NOT NULL,
  test_variant text NOT NULL DEFAULT 'either_side',
  results_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wlsm_backtest_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own WLSM results"
  ON public.wlsm_backtest_results FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own WLSM results"
  ON public.wlsm_backtest_results FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own WLSM results"
  ON public.wlsm_backtest_results FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);