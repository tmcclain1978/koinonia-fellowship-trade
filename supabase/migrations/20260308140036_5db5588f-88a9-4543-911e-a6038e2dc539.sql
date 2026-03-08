
-- Fix overly permissive INSERT policy - restrict to user's own logs or service role
DROP POLICY "Service role can insert audit logs" ON public.audit_log;

CREATE POLICY "Users can insert own audit logs"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
