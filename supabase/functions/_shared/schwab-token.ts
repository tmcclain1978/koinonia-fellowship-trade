/**
 * Schwab access token for a user, server-side (no browser session needed).
 * Same logic as the schwab-get-access-token function: reuse the cached token
 * while it has 5+ minutes left, otherwise refresh and store the new tokens
 * (Schwab rotates refresh tokens).
 */
import { encryptText, safeDecrypt } from "./encryption.ts";

const BUFFER_MS = 5 * 60_000;

export async function getSchwabAccessToken(admin: any, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("user_api_credentials")
    .select("schwab_client_id, schwab_client_secret, schwab_refresh_token, schwab_access_token, schwab_token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const clientId = await safeDecrypt(data.schwab_client_id);
  const clientSecret = await safeDecrypt(data.schwab_client_secret);
  const refreshToken = await safeDecrypt(data.schwab_refresh_token);
  const cached = await safeDecrypt(data.schwab_access_token);
  if (cached && data.schwab_token_expires_at && Date.parse(data.schwab_token_expires_at) - BUFFER_MS > Date.now()) return cached;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch("https://api.schwabapi.com/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) return null;
  const t = await res.json();
  if (!t?.access_token) return null;
  const patch: Record<string, unknown> = {
    schwab_access_token: await encryptText(t.access_token),
    schwab_token_expires_at: new Date(Date.now() + (Number(t.expires_in) || 1800) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (t.refresh_token && t.refresh_token !== refreshToken) {
    patch.schwab_refresh_token = await encryptText(t.refresh_token);
    patch.schwab_refresh_issued_at = new Date().toISOString();
  }
  await admin.from("user_api_credentials").update(patch).eq("user_id", userId);
  return t.access_token;
}
