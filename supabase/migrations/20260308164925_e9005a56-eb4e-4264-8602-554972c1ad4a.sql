
-- Persistent notifications table
CREATE TABLE public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.user_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notifications" ON public.user_notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.user_notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications" ON public.user_notifications FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage notifications" ON public.user_notifications FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

CREATE INDEX idx_user_notifications_user_id ON public.user_notifications(user_id, created_at DESC);

-- Service status history table
CREATE TABLE public.service_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  status text NOT NULL DEFAULT 'operational',
  latency integer,
  checked_at timestamptz NOT NULL DEFAULT now(),
  checked_by uuid
);

ALTER TABLE public.service_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view status history" ON public.service_status_history FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert status" ON public.service_status_history FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_status_history_service ON public.service_status_history(service_name, checked_at DESC);
