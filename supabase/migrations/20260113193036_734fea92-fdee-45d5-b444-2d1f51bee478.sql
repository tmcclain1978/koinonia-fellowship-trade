-- Add theme_preference column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS theme_preference text DEFAULT 'cyan';

-- Add a check constraint for valid theme values
ALTER TABLE public.profiles 
ADD CONSTRAINT valid_theme_preference 
CHECK (theme_preference IN ('cyan', 'purple', 'emerald', 'gold', 'rose', 'slate'));