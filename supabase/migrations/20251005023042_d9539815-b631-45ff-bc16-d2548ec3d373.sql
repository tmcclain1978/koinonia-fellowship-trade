-- Create security definer function to check if user has premium access
-- This checks if user is admin OR has an active subscription
CREATE OR REPLACE FUNCTION public.has_premium_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Check if user is admin OR has active subscription
  SELECT EXISTS (
    -- Admin check
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'::app_role
  ) OR EXISTS (
    -- Active subscription check
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND status = 'active'
      AND start_date <= now()
      AND (end_date IS NULL OR end_date > now())
  );
$$;

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view signals" ON public.trading_signals;

-- Create new restrictive policy for premium users only
CREATE POLICY "Premium users can view signals"
ON public.trading_signals
FOR SELECT
TO authenticated
USING (public.has_premium_access(auth.uid()));

-- Create policy for admins to insert/manage signals
CREATE POLICY "Admins can manage signals"
ON public.trading_signals
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Add documentation
COMMENT ON TABLE public.trading_signals IS 
'SECURITY MODEL: Premium trading signals restricted to paying subscribers and admins.
- SELECT: Only users with active subscriptions or admin role
- INSERT/UPDATE/DELETE: Only admins
Access verified via has_premium_access() function.';