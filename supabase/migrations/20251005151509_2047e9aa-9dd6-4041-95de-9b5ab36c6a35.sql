-- Add fields to podcasts table for live streaming and chat
ALTER TABLE public.podcasts
ADD COLUMN IF NOT EXISTS episode_type text NOT NULL DEFAULT 'recorded' CHECK (episode_type IN ('live', 'recorded')),
ADD COLUMN IF NOT EXISTS youtube_live_url text,
ADD COLUMN IF NOT EXISTS is_live_now boolean DEFAULT false;

-- Create chat messages table for live podcast chat
CREATE TABLE IF NOT EXISTS public.podcast_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_id uuid REFERENCES public.podcasts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  username text NOT NULL,
  message text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS on chat messages
ALTER TABLE public.podcast_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for chat messages
CREATE POLICY "Anyone can view chat messages"
ON public.podcast_chat_messages
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can send chat messages"
ON public.podcast_chat_messages
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.podcast_chat_messages;