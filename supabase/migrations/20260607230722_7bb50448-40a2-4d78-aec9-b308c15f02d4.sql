CREATE TABLE public.paper_order_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL,
  user_id uuid NOT NULL,
  parent_order_id uuid,
  oco_group uuid,
  event_type text NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  fill_price numeric,
  fill_quantity numeric,
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.paper_order_events TO authenticated;
GRANT ALL ON public.paper_order_events TO service_role;

ALTER TABLE public.paper_order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own order events"
  ON public.paper_order_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own order events"
  ON public.paper_order_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages order events"
  ON public.paper_order_events FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE INDEX paper_order_events_order_id_idx ON public.paper_order_events(order_id, created_at DESC);
CREATE INDEX paper_order_events_user_id_idx ON public.paper_order_events(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_paper_order_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  evt_type text;
  prev_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    evt_type := 'created';
    prev_status := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      evt_type := 'status_changed';
      prev_status := OLD.status;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.paper_order_events(
    order_id, user_id, parent_order_id, oco_group,
    event_type, previous_status, new_status,
    fill_price, fill_quantity, metadata
  ) VALUES (
    NEW.id, NEW.user_id, NEW.parent_order_id, NEW.oco_group,
    evt_type, prev_status, NEW.status,
    CASE WHEN NEW.status = 'filled' THEN NEW.filled_price ELSE NULL END,
    CASE WHEN NEW.status = 'filled' THEN NEW.quantity ELSE NULL END,
    jsonb_build_object(
      'symbol', NEW.symbol,
      'contract_key', NEW.contract_key,
      'side', NEW.side,
      'order_type', NEW.order_type
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS paper_orders_event_log ON public.paper_orders;
CREATE TRIGGER paper_orders_event_log
  AFTER INSERT OR UPDATE OF status ON public.paper_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_paper_order_event();