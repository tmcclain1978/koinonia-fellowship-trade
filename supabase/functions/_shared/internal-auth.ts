// Auth helpers for server-to-server and scheduled calls.
//
// Two secrets, set as Supabase Edge Function secrets:
//   CRON_SECRET              - known only to the pg_cron job and run-trading-bot
//   INTERNAL_FUNCTION_SECRET - known only to edge functions calling each other
//
// Why these exist: the project's anon key is PUBLIC (it ships in the frontend
// bundle), so `verify_jwt` alone does not stop an attacker who copies it.
// These shared secrets gate the sensitive bot endpoints above the gateway.

/** True if the request carries the correct cron secret header. */
export function isCronCall(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) return false; // fail closed if unconfigured
  return req.headers.get("x-cron-secret") === secret;
}

/** True if the request carries the correct internal-function secret header. */
export function isInternalCall(req: Request): boolean {
  const secret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (!secret) return false; // fail closed if unconfigured
  return req.headers.get("x-internal-secret") === secret;
}

/** Header object to attach when one edge function invokes another. */
export function internalHeaders(): Record<string, string> {
  return { "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "" };
}

/**
 * Resolve the authenticated user from the request's bearer token.
 * Returns the user object or null. `supabase` must be a client created with
 * the service-role key (used only to validate the token, not to elevate).
 */
export async function getAuthedUser(
  req: Request,
  supabase: { auth: { getUser: (jwt: string) => Promise<{ data: { user: unknown } }> } },
): Promise<unknown | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  try {
    const { data: { user } } = await supabase.auth.getUser(token);
    return user ?? null;
  } catch {
    return null;
  }
}
