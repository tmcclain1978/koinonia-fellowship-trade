// Upcoming earnings dates from Financial Modeling Prep (FMP_API_KEY), for the
// symbols asked. Real dates only: without a key or an answer it says so and
// returns none (the app then shows that the earnings check is off).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

export interface EarningsDate {
  symbol: string;
  /** YYYY-MM-DD */
  date: string;
  /** bmo = before the open, amc = after the close, null = not given. */
  time: "bmo" | "amc" | null;
}

export function normalizeEarnings(rows: unknown, symbols: string[] | null): EarningsDate[] {
  const want = symbols ? new Set(symbols.map((s) => s.toUpperCase())) : null;
  const out: EarningsDate[] = [];
  for (const r of (Array.isArray(rows) ? rows : []) as Array<Record<string, unknown> | null>) {
    const symbol = String(r?.symbol ?? "").toUpperCase();
    const date = String(r?.date ?? "").slice(0, 10);
    if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (want && !want.has(symbol)) continue;
    const t = String(r?.time ?? "").toLowerCase();
    out.push({ symbol, date, time: t === "bmo" ? "bmo" : t === "amc" ? "amc" : null });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = typeof body.from === "string" ? body.from.slice(0, 10) : iso(new Date(Date.now() - 3 * 86_400_000));
  const to = typeof body.to === "string" ? body.to.slice(0, 10) : iso(new Date(Date.now() + 60 * 86_400_000));
  const symbols = Array.isArray(body.symbols) ? body.symbols.map(String) : null;
  const key = Deno.env.get("FMP_API_KEY");
  if (!key) return json({ earnings: [], source: "unavailable", error: "The earnings calendar needs FMP_API_KEY to be set." });
  for (const url of [
    `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&apikey=${key}`,
    `https://financialmodelingprep.com/api/v3/earning_calendar?from=${from}&to=${to}&apikey=${key}`,
  ]) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const rows = await r.json();
      if (!Array.isArray(rows)) continue;
      return json({ earnings: normalizeEarnings(rows, symbols), source: "fmp", from, to });
    } catch (_) { /* try the next endpoint */ }
  }
  return json({ earnings: [], source: "unavailable", error: "The earnings calendar provider didn't answer." });
});
