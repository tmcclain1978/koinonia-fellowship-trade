/**
 * Real prices for server-side code (paper fills, stop checks, valuations).
 *
 *  - Stocks: Schwab quotes with the user's own Schwab connection; Polygon's
 *    latest 1-minute bar as a fallback (flagged delayed when Polygon says so).
 *  - Options: the single contract from Schwab's option chain.
 *
 * Never returns made-up prices. If nothing real is available it returns null
 * and the caller must say so (and not fill / not trigger).
 */
export interface ServerQuote {
  bid: number | null;
  ask: number | null;
  last: number | null;
  mark: number | null;
  source: "schwab" | "schwab-option" | "polygon" | "polygon-delayed";
  /** Option extras. */
  iv?: number | null;
  delta?: number | null;
  underlyingPrice?: number | null;
}

type Fetch = typeof fetch;
const pos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/* ---- pure parsers (tested) ------------------------------------------------ */

/** Schwab /quotes response → quote for one symbol. */
export function parseSchwabQuote(d: any, symbol: string): ServerQuote | null {
  const q = d?.[symbol]?.quote ?? d?.[symbol.toUpperCase()]?.quote;
  if (!q) return null;
  const bid = pos(q.bidPrice), ask = pos(q.askPrice), last = pos(q.lastPrice);
  const mark = pos(q.mark) ?? (bid && ask ? (bid + ask) / 2 : last);
  if (!bid && !ask && !last && !mark) return null;
  return { bid, ask, last, mark, source: "schwab" };
}

/** "CALL 150 2026-11-20" (any case) → parts, or null. */
export function parseContractKey(key: string | null | undefined): { type: "CALL" | "PUT"; strike: number; expiration: string | null } | null {
  const parts = (key ?? "").trim().split(/\s+/);
  if (parts.length < 2) return null;
  const t = parts[0].toUpperCase();
  if (t !== "CALL" && t !== "PUT") return null;
  const strike = Number(parts[1]);
  if (!Number.isFinite(strike) || strike <= 0) return null;
  const exp = parts[2] && /^\d{4}-\d{2}-\d{2}$/.test(parts[2]) ? parts[2] : null;
  return { type: t, strike, expiration: exp };
}

/** Schwab /chains response → the matching contract's quote. */
export function parseSchwabContract(d: any, key: { type: "CALL" | "PUT"; strike: number; expiration: string | null }): ServerQuote | null {
  const map = key.type === "CALL" ? d?.callExpDateMap : d?.putExpDateMap;
  if (!map) return null;
  for (const [expKey, strikes] of Object.entries(map as Record<string, Record<string, any[]>>)) {
    const exp = expKey.split(":")[0];
    if (key.expiration && exp !== key.expiration) continue;
    for (const [sk, contracts] of Object.entries(strikes)) {
      if (Math.abs(Number(sk) - key.strike) > 0.001) continue;
      const c = contracts?.[0];
      if (!c) continue;
      const bid = pos(c.bid), ask = pos(c.ask), last = pos(c.last);
      const mark = pos(c.mark) ?? (bid && ask ? (bid + ask) / 2 : last);
      if (!bid && !ask && !mark) return null;
      let iv = pos(c.volatility);
      if (iv && iv > 3) iv = iv / 100;
      return { bid, ask, last, mark, source: "schwab-option", iv, delta: typeof c.delta === "number" && c.delta > -2 && c.delta < 2 ? c.delta : null, underlyingPrice: pos(d.underlyingPrice) };
    }
  }
  return null;
}

/* ---- fetching -------------------------------------------------------------- */

export interface MarketDeps {
  userId: string;
  /** The user's Schwab access token, or null when not connected. */
  getToken: () => Promise<string | null>;
  polygonKey?: string | null;
  fetch?: Fetch;
}

const tokenCache = new Map<string, { token: string | null; at: number }>();

async function schwabToken(d: MarketDeps): Promise<string | null> {
  const hit = tokenCache.get(d.userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.token;
  const token = await d.getToken().catch(() => null);
  tokenCache.set(d.userId, { token, at: Date.now() });
  return token;
}

/** For tests. */
export const clearTokenCache = () => tokenCache.clear();

export async function stockQuote(d: MarketDeps, symbol: string): Promise<ServerQuote | null> {
  const f = d.fetch ?? fetch;
  const sym = symbol.toUpperCase();
  const token = await schwabToken(d);
  if (token) {
    try {
      const r = await f(`https://api.schwabapi.com/marketdata/v1/quotes?${new URLSearchParams({ symbols: sym, fields: "quote" })}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      if (r.ok) {
        const q = parseSchwabQuote(await r.json(), sym);
        if (q) return q;
      }
    } catch { /* fall back */ }
  }
  const key = d.polygonKey;
  if (key) {
    try {
      const now = Date.now();
      const r = await f(`https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym)}/range/1/minute/${now - 30 * 60_000}/${now}?adjusted=true&sort=desc&limit=1&apiKey=${key}`);
      if (r.ok) {
        const j = await r.json();
        const b = j?.results?.[0];
        if (b && pos(b.c)) return { bid: null, ask: null, last: b.c, mark: b.c, source: j.status === "DELAYED" ? "polygon-delayed" : "polygon" };
      }
    } catch { /* none */ }
  }
  return null;
}

export async function optionQuote(d: MarketDeps, symbol: string, contractKey: string): Promise<ServerQuote | null> {
  const key = parseContractKey(contractKey);
  if (!key) return null;
  const token = await schwabToken(d);
  if (!token) return null; // option prices come from Schwab only
  const f = d.fetch ?? fetch;
  const p = new URLSearchParams({ symbol: symbol.toUpperCase(), contractType: key.type, strike: String(key.strike), includeUnderlyingQuote: "true" });
  if (key.expiration) { p.set("fromDate", key.expiration); p.set("toDate", key.expiration); }
  try {
    const r = await f(`https://api.schwabapi.com/marketdata/v1/chains?${p}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (!r.ok) return null;
    return parseSchwabContract(await r.json(), key);
  } catch {
    return null;
  }
}

/** Stock or option (when contractKey is set). */
export function serverQuote(d: MarketDeps, symbol: string, contractKey?: string | null) {
  return contractKey ? optionQuote(d, symbol, contractKey) : stockQuote(d, symbol);
}
