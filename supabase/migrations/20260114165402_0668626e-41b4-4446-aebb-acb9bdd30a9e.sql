-- Add image_urls column to trading_journal table
ALTER TABLE public.trading_journal 
ADD COLUMN image_urls text[] DEFAULT NULL;

-- Create storage bucket for journal images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'journal-images',
  'journal-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

-- Create policy for authenticated users to upload their own images
CREATE POLICY "Users can upload journal images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'journal-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Create policy for authenticated users to view their own images
CREATE POLICY "Users can view their journal images"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'journal-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Create policy for public to view journal images (since bucket is public)
CREATE POLICY "Public can view journal images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'journal-images');

-- Create policy for users to delete their own images
CREATE POLICY "Users can delete their journal images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'journal-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);