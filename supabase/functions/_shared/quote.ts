// Server-side quote for paper trading and stop checks. Real prices only:
// Schwab (the user's own connection) for stocks and option contracts, Polygon
// as a stock fallback. Returns null when no real price is available; callers
// must then refuse to fill rather than guess. Never trusts a client price.
//
// (The previous version asked the schwab-quotes function, which can't see a
// server caller's Schwab login and returned a list the code read as a map, so
// the Schwab step never worked; it also priced option orders with the STOCK
// quote.)
import { getSchwabAccessToken } from "./schwab-token.ts";
import { serverQuote, type ServerQuote } from "./server-market.ts";

export interface NormalizedQuote {
  bid: number | null;
  ask: number | null;
  last: number | null;
  mark: number | null;
  source: string;
}

/**
 * @param supabase a client that can read this user's credentials (service role, or the user's own client)
 * @param contractKey "CALL 150 2026-11-20" for an option contract; omit for the stock
 */
export async function fetchQuote(
  supabase: any,
  userId: string,
  symbol: string,
  contractKey?: string | null,
): Promise<NormalizedQuote | null> {
  const q: ServerQuote | null = await serverQuote(
    { userId, getToken: () => getSchwabAccessToken(supabase, userId), polygonKey: Deno.env.get("POLYGON_API_KEY") ?? null },
    symbol,
    contractKey,
  );
  return q ? { bid: q.bid, ask: q.ask, last: q.last, mark: q.mark, source: q.source } : null;
}
