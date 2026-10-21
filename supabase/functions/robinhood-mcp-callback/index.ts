// OAuth callback: exchange code for tokens, store encrypted, mark ready.
// Returns a tiny HTML page that closes the popup / redirects back to /settings.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptText, encryptText } from "../_shared/encryption.ts";
import { exchangeCodeForToken } from "../_shared/mcp-oauth.ts";

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "https://koinoniatrading.org";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) return htmlResp(`Robinhood returned an error: ${err}`, false);
  if (!code || !state) return htmlResp("Missing code or state parameter.", false);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: conn, error: selErr } = await supabase
      .from("mcp_connections").select("*")
      .eq("oauth_state", state).eq("provider", "robinhood").maybeSingle();
    if (selErr || !conn) return htmlResp("Connection state not found or expired.", false);

    const verifier = await decryptText(conn.pkce_verifier_enc);
    const clientSecret = conn.client_secret_enc ? await decryptText(conn.client_secret_enc) : undefined;

    const tok = await exchangeCodeForToken({
      tokenEndpoint: conn.token_endpoint,
      code, redirectUri: conn.redirect_uri,
      clientId: conn.client_id, clientSecret, codeVerifier: verifier,
      resource: conn.server_url,
    });

    const patch: Record<string, unknown> = {
      state: "ready",
      access_token_enc: await encryptText(tok.access_token),
      pkce_verifier_enc: null,
      oauth_state: null,
      last_error: null,
      // A new login may be a different account or scope: the bot's live check must be run again.
      metadata: { ...((conn.metadata as Record<string, unknown>) ?? {}), bot: { ...((conn.metadata as any)?.bot ?? {}), ok: false, checkedAt: null, problems: ["Robinhood was reconnected; run the check again."] } },
    };
    if (tok.refresh_token) patch.refresh_token_enc = await encryptText(tok.refresh_token);
    if (tok.expires_in) patch.token_expires_at = new Date(Date.now() + tok.expires_in * 1000).toISOString();

    const { error: upErr } = await supabase.from("mcp_connections").update(patch).eq("id", conn.id);
    if (upErr) throw upErr;

    return htmlResp("Robinhood connected. You can close this window.", true);
  } catch (e) {
    console.error("[robinhood-mcp-callback]", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    try {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await supabase.from("mcp_connections").update({ state: "failed", last_error: msg })
        .eq("oauth_state", state).eq("provider", "robinhood");
    } catch (_) { /* ignore */ }
    return htmlResp(`Connection failed: ${msg}`, false);
  }
});

function htmlResp(message: string, ok: boolean) {
  const html = `<!doctype html><html><body style="font-family:system-ui;padding:32px;background:#0f172a;color:#e2e8f0">
<h2 style="color:${ok ? "#22c55e" : "#ef4444"}">${ok ? "✓ Connected" : "✗ Failed"}</h2>
<p>${message}</p>
<script>
  try { window.opener && window.opener.postMessage({ type: "robinhood-mcp", ok: ${ok} }, "*"); } catch(e){}
  setTimeout(() => { try { window.close(); } catch(e){} window.location.href = "${APP_ORIGIN}/settings?mcp=${ok ? "ok" : "err"}"; }, 1500);
</script>
</body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
