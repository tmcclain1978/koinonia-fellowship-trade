/**
 * Market data for the bot: Schwab (real-time, through the user's own Schwab
 * connection) with Polygon as a fallback. Polygon plans can be delayed; the
 * provider reports that so live trading can refuse to act on old prices.
 * Never returns made-up prices.
 */
import type { Bar } from "./strategy.ts";

export interface Quote {
  bid: number | null;
  ask: number | null;
  last: number | null;
  /** Epoch ms of the quote, if known. */
  time: number | null;
}

export interface MarketData {
  source: "schwab" | "polygon";
  /** False once any response says the data is delayed. */
  realtime: boolean;
  bars(symbol: string, minutes: 1 | 5, from: number, to: number): Promise<Bar[]>;
  quotes(symbols: string[]): Promise<Map<string, Quote>>;
}

type Fetch = typeof fetch;

export class RateLimited extends Error {}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

export function schwabData(token: string, f: Fetch = fetch): MarketData {
  const get = async (path: string) => {
    const r = await f(`https://api.schwabapi.com/marketdata/v1${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (r.status === 429) throw new RateLimited("Schwab rate limit");
    if (!r.ok) throw new Error(`Schwab ${r.status}`);
    return r.json();
  };
  return {
    source: "schwab",
    realtime: true,
    async bars(symbol, minutes, from, to) {
      const q = new URLSearchParams({
        symbol, frequencyType: "minute", frequency: String(minutes),
        startDate: String(Math.floor(from)), endDate: String(Math.floor(to)), needExtendedHoursData: "false",
      });
      const d = await get(`/pricehistory?${q}`);
      return (d?.candles ?? [])
        .map((c: any) => ({ t: Number(c.datetime), o: +c.open, h: +c.high, l: +c.low, c: +c.close, v: +c.volume || 0 }))
        .filter((b: Bar) => Number.isFinite(b.t) && b.c > 0);
    },
    async quotes(symbols) {
      const out = new Map<string, Quote>();
      if (!symbols.length) return out;
      const d = await get(`/quotes?${new URLSearchParams({ symbols: symbols.join(","), fields: "quote" })}`);
      for (const s of symbols) {
        const q = d?.[s]?.quote;
        if (!q) continue;
        out.set(s, { bid: num(q.bidPrice), ask: num(q.askPrice), last: num(q.lastPrice), time: Number(q.quoteTime ?? q.tradeTime) || null });
      }
      return out;
    },
  };
}

export function polygonData(apiKey: string, f: Fetch = fetch): MarketData {
  const md: MarketData = {
    source: "polygon",
    realtime: true,
    async bars(symbol, minutes, from, to) {
      const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${minutes}/minute/${Math.floor(from)}/${Math.floor(to)}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;
      const r = await f(url);
      if (r.status === 429) throw new RateLimited("Polygon rate limit");
      if (!r.ok) throw new Error(`Polygon ${r.status}`);
      const d = await r.json();
      if (d?.status === "DELAYED") md.realtime = false;
      // Polygon includes pre/after-market minutes; the bot trades the regular session only.
      return (d?.results ?? []).map((x: any) => ({ t: x.t, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v || 0 }));
    },
    async quotes(symbols) {
      // No bid/ask on basic plans: use the latest 1-minute close as "last".
      const out = new Map<string, Quote>();
      const now = Date.now();
      for (const s of symbols) {
        const bars = await md.bars(s, 1, now - 15 * 60_000, now);
        const b = bars[bars.length - 1];
        if (b) out.set(s, { bid: null, ask: null, last: b.c, time: b.t + 60_000 });
      }
      return out;
    },
  };
  return md;
}
