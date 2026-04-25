INSERT INTO storage.buckets (id, name, public)
VALUES ('lesson-videos', 'lesson-videos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Lesson videos are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'lesson-videos');

CREATE POLICY "Admins can upload lesson videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'lesson-videos' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update lesson videos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'lesson-videos' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete lesson videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'lesson-videos' AND public.has_role(auth.uid(), 'admin'::app_role));