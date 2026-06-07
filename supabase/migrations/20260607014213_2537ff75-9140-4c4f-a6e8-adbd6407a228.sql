-- Restore EXECUTE on security-definer helpers used inside RLS policies.
-- These are SECURITY DEFINER + STABLE and only read role/access state;
-- the previous revoke broke RLS evaluation for authenticated users.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_premium_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_family_enterprise_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_recent_day_trades(uuid, timestamptz) TO authenticated;