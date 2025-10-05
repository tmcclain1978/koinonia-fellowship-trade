-- Add identity verification columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS id_verification_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS id_verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'US',
ADD COLUMN IF NOT EXISTS verification_provider TEXT,
ADD COLUMN IF NOT EXISTS verification_session_id TEXT;

-- Add check constraint for verification status
ALTER TABLE public.profiles
ADD CONSTRAINT valid_verification_status 
CHECK (id_verification_status IN ('pending', 'verified', 'failed', 'rejected'));

-- Create index for faster verification queries
CREATE INDEX IF NOT EXISTS idx_profiles_verification_status 
ON public.profiles(id_verification_status);

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.id_verification_status IS 'Status of government ID verification: pending, verified, failed, rejected';