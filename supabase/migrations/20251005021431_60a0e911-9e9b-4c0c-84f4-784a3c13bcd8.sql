-- Fix contact_submissions: Add admin access policy
CREATE POLICY "Admins can view contact submissions"
ON public.contact_submissions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix promo_codes: Require authentication to view codes
DROP POLICY IF EXISTS "Anyone can view active promo codes" ON public.promo_codes;

CREATE POLICY "Authenticated users can view active promo codes"
ON public.promo_codes
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND (((uses_remaining IS NULL) OR (uses_remaining > 0)) 
  AND ((expires_at IS NULL) OR (expires_at > now())))
);

-- Fix usage_tracking: Replace overly permissive policy with proper JWT validation
DROP POLICY IF EXISTS "Service can manage usage" ON public.usage_tracking;

CREATE POLICY "Service role can manage usage"
ON public.usage_tracking
FOR ALL
USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));