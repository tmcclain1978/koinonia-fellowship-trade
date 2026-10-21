/**
 * Data for the Analytics page charts, from real candles and a real option
 * chain (pure, unit-tested).
 */
import { macd, rsiSeries } from "../../../supabase/functions/_shared/indicator-calc";
import type { OptionContract } from "@/components/charts/options/optionsLevels";
import type { Bar } from "@/lib/marketData/history";

/** Page timeframe -> fetch-schwab-candles interval. */
export const TIMEFRAME_INTERVAL: Record<string, string> = { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "1d": "daily" };

const label = (t: number, daily: boolean) =>
  new Date(t).toLocaleString("en-US", daily ? { month: "short", day: "numeric", timeZone: "America/New_York" } : { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export interface PriceView {
  volume: Array<{ time: string; volume: number; price: number }>;
  technicals: Array<{ time: string; price: number; rsi: number | null; macd: number | null }>;
}

/** The last `count` bars, with RSI(14) and MACD(12,26,9) computed on the full history. */
export function priceViews(bars: Bar[], daily: boolean, count = 40): PriceView {
  const close = bars.map((b) => b.c);
  const rsi = rsiSeries(close, 14);
  const m = macd(close).line;
  const from = Math.max(0, bars.length - count);
  const fin = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  const slice = bars.slice(from);
  return {
    volume: slice.map((b) => ({ time: label(b.t, daily), volume: b.v, price: b.c })),
    technicals: slice.map((b, i) => ({ time: label(b.t, daily), price: b.c, rsi: fin(rsi[from + i]), macd: fin(m[from + i]) })),
  };
}

export interface OptionsView {
  expiration: string;
  /** Option prices (mid) and total volume per strike near the stock price. */
  heatmap: Array<{ strike: number; call: number | null; put: number | null; volume: number }>;
  /** Implied volatility (percent) and open interest per strike and side. */
  ivOi: Array<{ strike: number; iv: number | null; oi: number; type: "call" | "put" }>;
}

/** Nearest expiration (at least 1 day out when available), strikes closest to the stock price. */
export function optionsView(contracts: OptionContract[], spot: number, strikes = 9): OptionsView | null {
  const exps = Array.from(new Set(contracts.map((c) => c.expiration))).sort();
  const exp = exps.find((e) => contracts.some((c) => c.expiration === e && c.t > 1 / 365)) ?? exps[0];
  if (!exp) return null;
  const inExp = contracts.filter((c) => c.expiration === exp);
  const near = Array.from(new Set(inExp.map((c) => c.strike)))
    .sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot))
    .slice(0, strikes)
    .sort((a, b) => a - b);
  const get = (k: number, type: "call" | "put") => inExp.find((c) => c.strike === k && c.type === type);
  const r2 = (v: number | null | undefined) => (typeof v === "number" ? Math.round(v * 100) / 100 : null);
  return {
    expiration: exp,
    heatmap: near.map((k) => ({ strike: k, call: r2(get(k, "call")?.mid), put: r2(get(k, "put")?.mid), volume: (get(k, "call")?.volume ?? 0) + (get(k, "put")?.volume ?? 0) })),
    ivOi: near.flatMap((k) =>
      (["call", "put"] as const).map((type) => {
        const c = get(k, type);
        return { strike: k, iv: c?.iv != null ? Math.round(c.iv * 1000) / 10 : null, oi: c?.oi ?? 0, type };
      }),
    ),
  };
}
