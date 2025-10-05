-- Add broker selection and multi-broker support to user_api_credentials
ALTER TABLE public.user_api_credentials
ADD COLUMN IF NOT EXISTS broker_type TEXT DEFAULT 'schwab' CHECK (broker_type IN ('schwab', 'td_ameritrade', 'etrade', 'interactive_brokers', 'alpaca')),
ADD COLUMN IF NOT EXISTS td_client_id TEXT,
ADD COLUMN IF NOT EXISTS td_client_secret TEXT,
ADD COLUMN IF NOT EXISTS td_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS etrade_consumer_key TEXT,
ADD COLUMN IF NOT EXISTS etrade_consumer_secret TEXT,
ADD COLUMN IF NOT EXISTS etrade_access_token TEXT,
ADD COLUMN IF NOT EXISTS etrade_access_secret TEXT,
ADD COLUMN IF NOT EXISTS ib_account_id TEXT,
ADD COLUMN IF NOT EXISTS ib_access_token TEXT,
ADD COLUMN IF NOT EXISTS alpaca_api_key TEXT,
ADD COLUMN IF NOT EXISTS alpaca_secret_key TEXT,
ADD COLUMN IF NOT EXISTS alpaca_paper_mode BOOLEAN DEFAULT true;

-- Add Stripe Identity verification fields to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS stripe_verification_session_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_verified_at TIMESTAMP WITH TIME ZONE;

-- Update verification status check constraint to include stripe
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS valid_verification_status;

ALTER TABLE public.profiles
ADD CONSTRAINT valid_verification_status 
CHECK (id_verification_status IN ('pending', 'verified', 'failed', 'rejected', 'stripe_pending', 'stripe_verified'));

-- Create index for broker type queries
CREATE INDEX IF NOT EXISTS idx_user_credentials_broker_type 
ON public.user_api_credentials(broker_type);

-- Add comment for documentation
COMMENT ON COLUMN public.user_api_credentials.broker_type IS 'Type of brokerage: schwab, td_ameritrade, etrade, interactive_brokers, alpaca';
COMMENT ON COLUMN public.profiles.stripe_verification_session_id IS 'Stripe Identity verification session ID for age and ID verification';