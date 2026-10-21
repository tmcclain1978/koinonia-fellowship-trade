-- Daily account value history (for performance stats on your own account).

-- One row per account per trading day: what the account was worth after the
-- close, and money moved in or out that day (so deposits aren't counted as
-- gains). Written only by the snapshot-equity function (service role).
CREATE TABLE IF NOT EXISTS public.account_equity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_kind text NOT NULL CHECK (account_kind IN ('schwab', 'paper')),
  -- Schwab: last 4 of the account number; paper: the paper account id.
  account_ref text NOT NULL,
  as_of_date date NOT NULL,
  equity numeric NOT NULL,
  cash numeric,
  positions_value numeric,
  -- Deposits minus withdrawals that day (Schwab ACH/wire/journal; 0 for paper).
  net_flows numeric NOT NULL DEFAULT 0,
  -- A change here starts a new series (e.g. paper account reset).
  series_key text NOT NULL DEFAULT '',
  -- Positions valued at cost because no real price was available.
  unpriced_positions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_kind, account_ref, as_of_date)
);

CREATE INDEX IF NOT EXISTS account_equity_snapshots_user_date
  ON public.account_equity_snapshots (user_id, account_kind, account_ref, as_of_date);

ALTER TABLE public.account_equity_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own equity snapshots" ON public.account_equity_snapshots;
CREATE POLICY "Users read their own equity snapshots"
  ON public.account_equity_snapshots FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Read-only for users: history can't be edited from the browser.
REVOKE INSERT, UPDATE, DELETE ON public.account_equity_snapshots FROM authenticated, anon;
GRANT SELECT ON public.account_equity_snapshots TO authenticated;

-- Paper account resets start a new history line (a reset is not a gain or loss).
ALTER TABLE public.paper_trading_accounts ADD COLUMN IF NOT EXISTS reset_count integer NOT NULL DEFAULT 0;

-- Daily after the close (21:15 UTC = 5:15 pm EDT / 4:15 pm EST), weekdays.
-- Cloned from the existing evaluate-paper-orders job command (it already
-- carries the authenticated headers), with only the target swapped.
SELECT cron.schedule(
  'snapshot-equity-daily',
  '15 21 * * 1-5',
  replace(
    (SELECT command FROM cron.job WHERE jobname = 'evaluate-paper-orders-every-min' LIMIT 1),
    'evaluate-paper-orders', 'snapshot-equity'
  )
);
