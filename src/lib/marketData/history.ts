/**
 * Real price history and option chains for analysis screens. These throw
 * instead of returning simulated data, so a screen can say "couldn't load"
 * rather than draw something made up.
 */
import { supabase } from "@/integrations/supabase/client";
import { parseChain, type OptionContract } from "@/components/charts/options/optionsLevels";

export interface Bar {
  /** Epoch ms */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** Sources that are real market data (anything else is refused). */
const REAL_SOURCES = new Set(["schwab", "polygon", "alphavantage"]);

const num = (v: unknown) => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : NaN;
};

/** Candle rows from fetch-schwab-candles (time in seconds, or timestamp/datetime) -> bars, oldest first. */
export function normalizeBars(rows: unknown): Bar[] {
  if (!Array.isArray(rows)) return [];
  const out: Bar[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    if (!r) continue;
    let t = NaN;
    if (r.time !== undefined) t = num(r.time) * 1000;
    else if (r.timestamp !== undefined) {
      t = num(r.timestamp);
      if (t < 1e12) t *= 1000;
    } else if (r.datetime !== undefined) t = typeof r.datetime === "string" && isNaN(Number(r.datetime)) ? Date.parse(r.datetime) : num(r.datetime);
    const bar = { t, o: num(r.open), h: num(r.high), l: num(r.low), c: num(r.close), v: num(r.volume) };
    if (![bar.t, bar.o, bar.h, bar.l, bar.c].every(Number.isFinite) || bar.c <= 0) continue;
    if (!Number.isFinite(bar.v)) bar.v = 0;
    out.push(bar);
  }
  out.sort((a, b) => a.t - b.t);
  return out.filter((b, i) => i === 0 || b.t !== out[i - 1].t);
}

export class NoDataError extends Error {}

export async function loadBars(symbol: string, interval: string, period = "1y"): Promise<{ bars: Bar[]; source: string }> {
  const { data, error } = await supabase.functions.invoke("fetch-schwab-candles", { body: { symbol, interval, period } });
  if (error) throw new Error(error.message || "Couldn't reach the price service");
  const source = String(data?.source ?? "");
  if (!REAL_SOURCES.has(source)) throw new NoDataError(data?.error || `No price history available for ${symbol}.`);
  const bars = normalizeBars(data?.data ?? data?.candles);
  if (!bars.length) throw new NoDataError(`No price history available for ${symbol}.`);
  return { bars, source };
}

export async function loadOptionChain(symbol: string, days = 45, strikes = 30): Promise<{ contracts: OptionContract[]; spot: number; asOf: number }> {
  const now = Date.now();
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const { data, error } = await supabase.functions.invoke("fetch-schwab-options", {
    body: { symbol, fromDate: day(now), toDate: day(now + days * 86_400_000), strikeCount: strikes },
  });
  if (error) throw new Error(error.message || "Couldn't reach the options service");
  if (data?.source !== "schwab") throw new NoDataError("Option chains need a Schwab connection.");
  const spot = Number(data.underlyingPrice);
  const contracts = parseChain(data.options ?? [], now);
  if (!(spot > 0) || !contracts.length) throw new NoDataError(`No option chain available for ${symbol}.`);
  return { contracts, spot, asOf: data.asOf ?? now };
}

/** Simple daily returns keyed by ET date (YYYY-MM-DD), for lining up two symbols. */
export function dailyReturns(bars: Bar[]): Map<string, number> {
  const out = new Map<string, number>();
  const key = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  for (let i = 1; i < bars.length; i++) {
    if (bars[i - 1].c > 0) out.set(key(bars[i].t), bars[i].c / bars[i - 1].c - 1);
  }
  return out;
}

/** Returns for dates both series have, in date order. */
export function alignReturns(a: Map<string, number>, b: Map<string, number>): { dates: string[]; a: number[]; b: number[] } {
  const dates = Array.from(a.keys()).filter((d) => b.has(d)).sort();
  return { dates, a: dates.map((d) => a.get(d)!), b: dates.map((d) => b.get(d)!) };
}
