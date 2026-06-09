CREATE TABLE IF NOT EXISTS public.mcp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  server_url text NOT NULL,
  state text NOT NULL DEFAULT 'authenticating',
  scope_mode text NOT NULL DEFAULT 'read_only',
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  client_id text,
  client_secret_enc text,
  authorization_endpoint text,
  token_endpoint text,
  registration_endpoint text,
  pkce_verifier_enc text,
  oauth_state text,
  redirect_uri text,
  last_error text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_connections TO authenticated;
GRANT ALL ON public.mcp_connections TO service_role;

ALTER TABLE public.mcp_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own mcp connections"
  ON public.mcp_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users insert own mcp connections"
  ON public.mcp_connections FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own mcp connections"
  ON public.mcp_connections FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own mcp connections"
  ON public.mcp_connections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER mcp_connections_updated_at
  BEFORE UPDATE ON public.mcp_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_mcp_connections_user_provider ON public.mcp_connections(user_id, provider);