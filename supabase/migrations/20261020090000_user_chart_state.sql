-- Chart settings and drawings that follow a user across devices.
-- One JSON value per (user, key). Keys used by the app:
--   'prefs'            chart preferences (indicators, scale, signal line styles)
--   'drawings:<SYMBOL>' drawing-tool objects for one symbol
CREATE TABLE IF NOT EXISTS public.user_chart_state (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 100),
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- Guard against runaway payloads (a symbol's drawings or the prefs object).
ALTER TABLE public.user_chart_state
  ADD CONSTRAINT user_chart_state_value_size CHECK (pg_column_size(value) <= 262144);

ALTER TABLE public.user_chart_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chart state"
  ON public.user_chart_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chart state"
  ON public.user_chart_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chart state"
  ON public.user_chart_state FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own chart state"
  ON public.user_chart_state FOR DELETE
  USING (auth.uid() = user_id);
