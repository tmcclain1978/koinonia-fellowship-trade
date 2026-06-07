
-- 1. podcast_chat_messages: scoped SELECT
DROP POLICY IF EXISTS "Anyone can view chat messages" ON public.podcast_chat_messages;
DROP POLICY IF EXISTS "Members can view chat messages of published podcasts" ON public.podcast_chat_messages;
CREATE POLICY "Members can view chat messages of published podcasts"
ON public.podcast_chat_messages FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.podcasts p
    WHERE p.id = podcast_chat_messages.podcast_id
      AND p.status = 'published'
  )
);

-- 2. user_roles admin-only writes
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. service_status_history admin-only reads
DROP POLICY IF EXISTS "Public can view service status" ON public.service_status_history;
DROP POLICY IF EXISTS "Anyone can view service status" ON public.service_status_history;
DROP POLICY IF EXISTS "Admins can view service status" ON public.service_status_history;
CREATE POLICY "Admins can view service status" ON public.service_status_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. lesson-videos storage: premium/admin SELECT only
DROP POLICY IF EXISTS "Premium users can view lesson videos" ON storage.objects;
CREATE POLICY "Premium users can view lesson videos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lesson-videos'
  AND (
    public.has_premium_access(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- 5. Lock down security definer helpers
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_premium_access(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_family_enterprise_access(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_recent_day_trades(uuid, timestamptz) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM anon, authenticated, PUBLIC;
