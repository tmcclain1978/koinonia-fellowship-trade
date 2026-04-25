DROP POLICY IF EXISTS "Lesson videos are publicly viewable" ON storage.objects;

-- Public bucket files are accessible via direct CDN URL without any SELECT policy needed.
-- Omitting a SELECT policy prevents listing while still allowing direct fetches on public buckets.