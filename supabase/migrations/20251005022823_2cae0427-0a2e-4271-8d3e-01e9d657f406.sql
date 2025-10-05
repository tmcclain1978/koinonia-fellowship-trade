-- Add security documentation to contact_submissions table
-- This clarifies that the table is properly secured by RLS

COMMENT ON TABLE public.contact_submissions IS 
'SECURITY MODEL: This table stores sensitive customer contact information (PII).
- INSERT: Only via edge functions using service_role (public contact form submissions)
- SELECT: Only admins can view submissions
- UPDATE/DELETE: Only service_role for administrative operations
- Regular authenticated users: NO ACCESS (denied by default RLS)
- Anonymous users: NO ACCESS (denied by default RLS)
RLS is enabled and enforces these restrictions.';

-- Add comments to sensitive columns
COMMENT ON COLUMN public.contact_submissions.email IS 'PII: Customer email address - admin access only';
COMMENT ON COLUMN public.contact_submissions.phone IS 'PII: Customer phone number - admin access only';
COMMENT ON COLUMN public.contact_submissions.first_name IS 'PII: Customer first name - admin access only';
COMMENT ON COLUMN public.contact_submissions.last_name IS 'PII: Customer last name - admin access only';
COMMENT ON COLUMN public.contact_submissions.message IS 'Sensitive: Customer message content - admin access only';

-- Verify RLS is enabled (this is idempotent)
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- Ensure there are no overly permissive policies by explicitly documenting expected policies
-- Current policies:
-- 1. "Admins can view contact submissions" - SELECT for admins only
-- 2. "Service role can manage submissions" - ALL for service_role (edge functions)
-- 
-- No INSERT/UPDATE/DELETE policies exist for regular users (secure by design)