// Shared CORS helper for edge functions.
//
// Instead of a blanket `Access-Control-Allow-Origin: *`, this echoes the
// request's Origin back ONLY if it appears in the ALLOWED_ORIGINS allowlist.
//
// Configure in production (Supabase dashboard > Edge Functions > Secrets):
//   ALLOWED_ORIGINS="https://app.yourdomain.com,https://yourdomain.com"
//
// If ALLOWED_ORIGINS is unset (e.g. local development), it falls back to
// echoing the caller's origin so dev isn't broken. ALWAYS set it in prod.

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const BASE_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

/** Returns true if the request's Origin is permitted. */
export function isOriginAllowed(req: Request): boolean {
  // No allowlist configured -> permissive (dev only).
  if (ALLOWED_ORIGINS.length === 0) return true;
  const origin = req.headers.get("Origin") || "";
  return ALLOWED_ORIGINS.includes(origin);
}

/** Build CORS headers scoped to the caller's origin (never a blanket `*`). */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";

  let allowOrigin: string;
  if (ALLOWED_ORIGINS.length === 0) {
    // Dev fallback: echo the caller, or `*` if no Origin header (e.g. curl).
    allowOrigin = origin || "*";
  } else if (ALLOWED_ORIGINS.includes(origin)) {
    allowOrigin = origin;
  } else {
    // Disallowed origin: send a value the browser will reject.
    allowOrigin = "null";
  }

  return { ...BASE_HEADERS, "Access-Control-Allow-Origin": allowOrigin };
}

/** Convenience JSON responder that includes CORS headers. */
export function jsonResponse(
  body: unknown,
  status: number,
  req: Request,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
