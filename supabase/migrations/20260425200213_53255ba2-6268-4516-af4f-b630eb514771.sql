
-- 1. Promo codes: remove broad authenticated SELECT, admins-only via existing manage policy
DROP POLICY IF EXISTS "Authenticated users can view active promo codes" ON public.promo_codes;

-- 2. Service status history: restrict INSERT to admins only
DROP POLICY IF EXISTS "Authenticated users can insert status" ON public.service_status_history;
CREATE POLICY "Admins can insert status history"
ON public.service_status_history
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Journal images: remove public SELECT policy (users still access via owner-scoped policy)
DROP POLICY IF EXISTS "Public can view journal images" ON storage.objects;

-- 4. Make journal-images bucket private (files served via signed URLs)
UPDATE storage.buckets SET public = false WHERE id = 'journal-images';

-- 5. Lesson videos: keep bucket public for direct-URL playback, but ensure no listing policy.
-- (No SELECT policy exists on storage.objects for lesson-videos, so listing is already disallowed.)

-- 6. Realtime messages: enable RLS and restrict subscriptions
DO $$
BEGIN
  EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Cannot alter realtime.messages - insufficient privileges';
END $$;

DO $$
BEGIN
  EXECUTE $POL$
    DROP POLICY IF EXISTS "Users can subscribe to own topics" ON realtime.messages;
    CREATE POLICY "Users can subscribe to own topics"
    ON realtime.messages
    FOR SELECT
    TO authenticated
    USING (
      auth.uid() IS NOT NULL AND (
        realtime.topic() LIKE '%' || auth.uid()::text || '%'
        OR realtime.topic() IN ('public:podcast_chat_messages')
      )
    );
  $POL$;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Cannot create policy on realtime.messages - insufficient privileges';
END $$;
