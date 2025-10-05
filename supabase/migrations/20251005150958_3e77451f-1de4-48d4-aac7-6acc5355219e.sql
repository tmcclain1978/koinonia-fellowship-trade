-- Create videos table for education content
CREATE TABLE public.videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration TEXT,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on videos
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

-- Admins can manage videos
CREATE POLICY "Admins can manage videos"
  ON public.videos
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- All authenticated users can view published videos
CREATE POLICY "Users can view published videos"
  ON public.videos
  FOR SELECT
  USING (status = 'published' OR has_role(auth.uid(), 'admin'));

-- Create podcasts table
CREATE TABLE public.podcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  audio_url TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  duration TEXT,
  show_notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  publish_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on podcasts
ALTER TABLE public.podcasts ENABLE ROW LEVEL SECURITY;

-- Admins can manage podcasts
CREATE POLICY "Admins can manage podcasts"
  ON public.podcasts
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- All authenticated users can view published podcasts
CREATE POLICY "Users can view published podcasts"
  ON public.podcasts
  FOR SELECT
  USING (status = 'published' OR has_role(auth.uid(), 'admin'));

-- Add updated_at triggers
CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_podcasts_updated_at
  BEFORE UPDATE ON public.podcasts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();