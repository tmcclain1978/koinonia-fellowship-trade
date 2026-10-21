// Economic calendar from Financial Modeling Prep (FMP_API_KEY). Real events
// only: if FMP isn't configured or doesn't answer, it says so and returns no
// events. (It used to return randomly generated events.)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

export interface EconomicEvent {
  id: string;
  /** ISO timestamp (UTC). */
  at: string;
  country: string;
  event: string;
  importance: 'high' | 'medium' | 'low';
  previous: string;
  forecast: string;
  actual?: string;
  currency?: string;
}

const fmtVal = (v: unknown, unit?: string) => (v === null || v === undefined || v === '' ? '' : `${v}${unit && !String(v).endsWith(unit) ? unit : ''}`);

export function normalizeFmp(rows: any[]): EconomicEvent[] {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r.event && r.date)
    .map((r, i) => {
      // FMP dates are "YYYY-MM-DD HH:MM:SS" in UTC.
      const at = new Date(String(r.date).replace(' ', 'T') + (String(r.date).includes('Z') ? '' : 'Z')).toISOString();
      const impact = String(r.impact ?? '').toLowerCase();
      const unit = r.unit ? String(r.unit) : undefined;
      return {
        id: `${r.date}-${r.country}-${i}`,
        at,
        country: String(r.country ?? ''),
        event: String(r.event),
        importance: impact === 'high' ? 'high' : impact === 'medium' ? 'medium' : 'low',
        previous: fmtVal(r.previous, unit),
        forecast: fmtVal(r.estimate ?? r.consensus, unit),
        actual: r.actual === null || r.actual === undefined || r.actual === '' ? undefined : fmtVal(r.actual, unit),
        currency: r.currency ?? undefined,
      } as EconomicEvent;
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = typeof body.startDate === 'string' ? body.startDate.slice(0, 10) : iso(new Date(Date.now() - 2 * 86_400_000));
  const to = typeof body.endDate === 'string' ? body.endDate.slice(0, 10) : iso(new Date(Date.now() + 14 * 86_400_000));
  const key = Deno.env.get('FMP_API_KEY');
  if (!key) return json({ events: [], source: 'unavailable', error: 'The economic calendar needs FMP_API_KEY to be set.' });

  for (const url of [
    `https://financialmodelingprep.com/stable/economic-calendar?from=${from}&to=${to}&apikey=${key}`,
    `https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${key}`,
  ]) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const rows = await r.json();
      if (!Array.isArray(rows)) continue;
      let events = normalizeFmp(rows);
      if (Array.isArray(body.countries) && body.countries.length) events = events.filter((e) => body.countries.includes(e.country));
      if (Array.isArray(body.importance) && body.importance.length) events = events.filter((e) => body.importance.includes(e.importance));
      return json({ events, source: 'fmp', from, to });
    } catch (_) { /* try the next endpoint */ }
  }
  return json({ events: [], source: 'unavailable', error: "The economic calendar provider didn't answer. Try again later." });
});
