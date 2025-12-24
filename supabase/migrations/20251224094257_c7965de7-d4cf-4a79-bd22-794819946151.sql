-- Add columns for caching Schwab access token
ALTER TABLE public.user_api_credentials 
ADD COLUMN IF NOT EXISTS schwab_access_token TEXT,
ADD COLUMN IF NOT EXISTS schwab_token_expires_at TIMESTAMP WITH TIME ZONE;