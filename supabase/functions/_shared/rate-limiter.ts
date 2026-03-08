// Simple in-memory per-user rate limiter for edge functions
// Resets when the edge function cold-starts

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

/**
 * Check if a request is within rate limits.
 * @param key Unique key (typically `userId:functionName`)
 * @param maxRequests Max requests per window
 * @param windowMs Window size in milliseconds (default: 60s)
 * @returns { allowed: boolean; retryAfterMs?: number }
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs = 60_000
): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (bucket.count >= maxRequests) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count++;
  return { allowed: true };
}

/** Return a 429 Response when rate limit is exceeded */
export function rateLimitResponse(retryAfterMs: number, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please try again later.",
      retryAfterMs,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
      },
    }
  );
}
