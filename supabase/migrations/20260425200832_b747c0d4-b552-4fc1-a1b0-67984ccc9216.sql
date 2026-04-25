
-- 1. Family plan owners can see members they invited
CREATE POLICY "Primary users can view their family members"
ON public.family_members
FOR SELECT
TO authenticated
USING (auth.uid() = primary_user_id);

-- 2. Auto trades log: allow service role to insert
CREATE POLICY "Service role can insert auto trades"
ON public.auto_trades_log
FOR INSERT
TO authenticated, anon
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- 3. Journal images: allow users to update their own files
CREATE POLICY "Users can update their journal images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'journal-images' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'journal-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 4. Lesson videos: make bucket private and add auth-gated SELECT policy
UPDATE storage.buckets SET public = false WHERE id = 'lesson-videos';

CREATE POLICY "Authenticated users can view lesson videos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'lesson-videos' AND auth.uid() IS NOT NULL);

-- 5. Contact submissions: allow anonymous form submission (admins still gate reads)
CREATE POLICY "Anyone can submit contact form"
ON public.contact_submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 6. Tighten realtime topic policy: strict prefix instead of substring LIKE
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
        realtime.topic() = 'private:' || auth.uid()::text
        OR realtime.topic() LIKE 'private:' || auth.uid()::text || ':%'
        OR realtime.topic() = 'public:podcast_chat_messages'
      )
    );
  $POL$;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Cannot alter realtime.messages policy';
END $$;
