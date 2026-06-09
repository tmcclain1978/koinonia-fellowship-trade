// Shared OAuth 2.1 + PKCE + Dynamic Client Registration helper for MCP servers.
// Implements the MCP authorization spec discovery flow:
//   1) GET <origin>/.well-known/oauth-authorization-server (fallback: /.well-known/openid-configuration)
//   2) Dynamic client registration if registration_endpoint present
//   3) PKCE authorization code flow
//   4) Token refresh

export interface OAuthServerMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
}

function b64url(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomString(len = 64): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return b64url(bytes).slice(0, len);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(hash));
}

export async function discoverMetadata(serverUrl: string): Promise<OAuthServerMetadata> {
  const u = new URL(serverUrl);
  const origin = `${u.protocol}//${u.host}`;
  const candidates = [
    `${origin}/.well-known/oauth-authorization-server`,
    `${origin}/.well-known/openid-configuration`,
  ];
  for (const url of candidates) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (r.ok) {
        const j = await r.json();
        if (j.authorization_endpoint && j.token_endpoint) return j as OAuthServerMetadata;
      }
    } catch (_) { /* try next */ }
  }
  throw new Error(`Could not discover OAuth metadata at ${origin}/.well-known/oauth-authorization-server`);
}

export async function registerClient(
  registrationEndpoint: string,
  redirectUri: string,
  clientName = "Lovable Trading Companion",
): Promise<{ client_id: string; client_secret?: string }> {
  const body = {
    client_name: clientName,
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    application_type: "web",
  };
  const r = await fetch(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Dynamic client registration failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  if (!j.client_id) throw new Error("Registration response missing client_id");
  return { client_id: j.client_id, client_secret: j.client_secret };
}

export interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export async function exchangeCodeForToken(opts: {
  tokenEndpoint: string;
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret?: string;
  codeVerifier: string;
  resource?: string;
}): Promise<TokenResponse> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    code_verifier: opts.codeVerifier,
  });
  if (opts.clientSecret) form.set("client_secret", opts.clientSecret);
  if (opts.resource) form.set("resource", opts.resource);
  const r = await fetch(opts.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form,
  });
  if (!r.ok) throw new Error(`Token exchange failed: ${r.status} ${await r.text()}`);
  return await r.json();
}

export async function refreshToken(opts: {
  tokenEndpoint: string;
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
  resource?: string;
}): Promise<TokenResponse> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
  });
  if (opts.clientSecret) form.set("client_secret", opts.clientSecret);
  if (opts.resource) form.set("resource", opts.resource);
  const r = await fetch(opts.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form,
  });
  if (!r.ok) throw new Error(`Token refresh failed: ${r.status} ${await r.text()}`);
  return await r.json();
}

export function buildAuthorizeUrl(opts: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scope?: string;
  resource?: string;
}): string {
  const u = new URL(opts.authorizationEndpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("code_challenge", opts.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", opts.state);
  if (opts.scope) u.searchParams.set("scope", opts.scope);
  if (opts.resource) u.searchParams.set("resource", opts.resource);
  return u.toString();
}
