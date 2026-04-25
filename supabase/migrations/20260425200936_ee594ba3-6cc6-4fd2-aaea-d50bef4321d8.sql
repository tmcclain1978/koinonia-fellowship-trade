
UPDATE storage.buckets SET public = true WHERE id = 'lesson-videos';
DROP POLICY IF EXISTS "Authenticated users can view lesson videos" ON storage.objects;

DROP POLICY IF EXISTS "Anyone can submit contact form" ON public.contact_submissions;
CREATE POLICY "Anyone can submit contact form"
ON public.contact_submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(coalesce(first_name, '')) BETWEEN 1 AND 100
  AND length(coalesce(last_name, '')) BETWEEN 1 AND 100
  AND length(coalesce(email, '')) BETWEEN 3 AND 320
  AND length(coalesce(message, '')) BETWEEN 1 AND 5000
  AND length(coalesce(phone, '')) <= 50
  AND length(coalesce(trading_experience, '')) <= 100
);
