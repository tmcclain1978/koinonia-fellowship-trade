// Shared helpers for authenticating edge function calls.
//
// Two accepted call modes:
//  1. Internal call from another edge function — proves it knows
//     INTERNAL_FUNCTION_SECRET (sent via the `x-internal-secret` header).
//  2. End-user call — carries a valid Supabase user JWT in `Authorization`.
//
// Anonymous calls using only the public anon key are rejected by callers
// that gate on these helpers, which prevents abuse of paid AI endpoints.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") || "";

/** True if the request carries the internal function secret. */
export function isInternalCall(req: Request): boolean {
  if (!INTERNAL_SECRET) return false;
  const provided = req.headers.get("x-internal-secret") || "";
  return provided.length > 0 && provided === INTERNAL_SECRET;
}

/** Headers to attach when one edge function calls another internally. */
export function internalHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-internal-secret": INTERNAL_SECRET,
  };
}

/**
 * Returns the authenticated user (if any) for a request bearing a user JWT.
 * Returns null when the token is missing, invalid, or belongs to the anon role.
 */
export async function getAuthedUser(
  req: Request,
  supabase: SupabaseClient,
): Promise<{ id: string } | null> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) return null;

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return { id: data.user.id };
  } catch {
    return null;
  }
}
