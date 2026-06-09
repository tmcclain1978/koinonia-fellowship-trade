// Start the Robinhood MCP OAuth flow: discover metadata, register client (DCR),
// generate PKCE, persist a pending connection row, return authorize URL.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptText } from "../_shared/encryption.ts";
import { discoverMetadata, registerClient, pkceChallenge, randomString, buildAuthorizeUrl } from "../_shared/mcp-oauth.ts";
import { logAudit } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SERVER_URL = "https://agent.robinhood.com/mcp/trading";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const scopeMode: "read_only" | "trading" = body.scope_mode === "trading" ? "trading" : "read_only";

    const projectRef = Deno.env.get("SUPABASE_URL")!.split(".")[0].replace("https://", "");
    const redirectUri = `https://${projectRef}.supabase.co/functions/v1/robinhood-mcp-callback`;

    const meta = await discoverMetadata(SERVER_URL);

    let clientId: string | undefined;
    let clientSecret: string | undefined;
    if (meta.registration_endpoint) {
      try {
        const reg = await registerClient(meta.registration_endpoint, redirectUri);
        clientId = reg.client_id;
        clientSecret = reg.client_secret;
      } catch (e) {
        return json({ error: `Dynamic client registration failed: ${e instanceof Error ? e.message : String(e)}` }, 400);
      }
    } else {
      return json({ error: "Robinhood MCP does not expose dynamic client registration; pre-registered client required." }, 400);
    }

    const verifier = randomString(64);
    const challenge = await pkceChallenge(verifier);
    const state = randomString(32);
    const scope = scopeMode === "trading" ? "trading read" : "read";

    const patch = {
      user_id: user.id,
      provider: "robinhood",
      server_url: SERVER_URL,
      state: "authenticating",
      scope_mode: scopeMode,
      client_id: clientId!,
      client_secret_enc: clientSecret ? await encryptText(clientSecret) : null,
      authorization_endpoint: meta.authorization_endpoint,
      token_endpoint: meta.token_endpoint,
      registration_endpoint: meta.registration_endpoint ?? null,
      pkce_verifier_enc: await encryptText(verifier),
      oauth_state: state,
      redirect_uri: redirectUri,
      last_error: null,
      access_token_enc: null,
      refresh_token_enc: null,
      token_expires_at: null,
    };

    const { error: upErr } = await supabase
      .from("mcp_connections")
      .upsert(patch, { onConflict: "user_id,provider" });
    if (upErr) throw upErr;

    const authUrl = buildAuthorizeUrl({
      authorizationEndpoint: meta.authorization_endpoint,
      clientId: clientId!,
      redirectUri,
      codeChallenge: challenge,
      state,
      scope,
    });

    await logAudit({ userId: user.id, action: "mcp.connect.initiated", resourceType: "mcp_connection",
      details: { provider: "robinhood", scope_mode: scopeMode } });

    return json({ authUrl, redirectUri, scopeMode });
  } catch (e) {
    console.error("[robinhood-mcp-connect]", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
