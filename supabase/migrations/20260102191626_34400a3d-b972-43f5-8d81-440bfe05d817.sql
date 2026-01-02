-- Create family_members table for family subscription management
CREATE TABLE public.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_user_id uuid NOT NULL,
  member_email text NOT NULL,
  member_user_id uuid,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(primary_user_id, member_email)
);

-- Enable RLS
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- Admins can manage all family members
CREATE POLICY "Admins can manage family members"
ON public.family_members
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Users can view their own family membership
CREATE POLICY "Users can view own family membership"
ON public.family_members
FOR SELECT
USING (auth.uid() = member_user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_family_members_updated_at
BEFORE UPDATE ON public.family_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to check if user has family enterprise access
CREATE OR REPLACE FUNCTION public.has_family_enterprise_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE member_user_id = _user_id
      AND status = 'active'
  )
$$;

-- Update has_premium_access to include family members
CREATE OR REPLACE FUNCTION public.has_premium_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  ) OR EXISTS (
    -- Family member check
    SELECT 1 FROM public.family_members
    WHERE member_user_id = _user_id
      AND status = 'active'
  );
$$;