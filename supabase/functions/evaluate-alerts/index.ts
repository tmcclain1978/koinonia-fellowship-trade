// Checks every active price alert, every minute (pg_cron), whether or not the
// user has the app open. Fires in-app notifications and (optionally) email.
//
// Data: Polygon aggregates with the server's POLYGON_API_KEY. 1-minute bars
// since the last check are used for price levels, so a touch-and-reverse
// between checks still counts. Polygon marks delayed data with
// status "DELAYED"; that is passed on in the notification.
//
// Calls:
//   - pg_cron with x-cron-secret: all users.
//   - a signed-in user ("Check now"): only that user's alerts.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { isCronCall } from "../_shared/internal-auth.ts";
import { evaluateAlert, needsTimeframeBars, timeframeMs, type AlertRow, type Bar, type AlertTimeframe } from "../_shared/alert-eval.ts";
import { aggregateCandles, isRegularSessionTime, etWallTimeToEpoch } from "../_shared/candle-buckets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MIN = 60_000;
const DAY = 86_400_000;
const MAX_SYMBOLS_PER_RUN = 60;
const MAX_LOOKBACK_MS = 6 * 60 * MIN; // never re-scan more than 6 hours of minute bars
const MANUAL_MIN_INTERVAL_MS = 30_000;
const EMAIL_FROM = "Koinonia Alerts <alerts@koinoniatrading.org>";

interface PriceAlertDb extends AlertRow {
  user_id: string;
  is_active: boolean;
  is_triggered: boolean;
  frequency: "once" | "repeat";
  cooldown_minutes: number;
  notify_email: boolean;
  last_checked_at: string | null;
  triggered_at: string | null;
  trigger_count: number;
  created_at: string;
  updated_at: string;
  notes: string | null;
}

const etDateKey = (t: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));

/* ---------------------------------------------------------------- Polygon */

class RateLimited extends Error {}

async function polygonBars(apiKey: string, symbol: string, mult: number, span: "minute" | "day", from: number, to: number) {
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${mult}/${span}/${Math.floor(from)}/${Math.floor(to)}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (res.status === 429) throw new RateLimited("Polygon rate limit");
  if (!res.ok) throw new Error(`Polygon ${res.status}`);
  const data = await res.json();
  const bars: Bar[] = (data.results ?? []).map((r: any) => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v ?? 0 }));
  return { bars, delayed: data.status === "DELAYED" };
}

async function polygonPrevClose(apiKey: string, symbol: string): Promise<number | null> {
  const res = await fetch(`https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/prev?adjusted=true&apiKey=${apiKey}`);
  if (res.status === 429) throw new RateLimited("Polygon rate limit");
  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[0]?.c ?? null;
}

const LOOKBACK_DAYS: Record<AlertTimeframe, number> = { "5": 12, "15": 35, "60": 120, D: 420 };

async function timeframeBars(apiKey: string, symbol: string, tf: AlertTimeframe, now: number) {
  const from = now - LOOKBACK_DAYS[tf] * DAY;
  if (tf === "D") return polygonBars(apiKey, symbol, 1, "day", from, now);
  // Regular-session bars only, like the chart's default; 1H is built from
  // 30-minute bars so it starts at 9:30 like the chart.
  const src = await polygonBars(apiKey, symbol, tf === "60" ? 30 : Number(tf), "minute", from, now);
  const regular = src.bars.filter((b) => isRegularSessionTime(b.t));
  const bars = tf === "60"
    ? aggregateCandles(regular.map((b) => ({ timestamp: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v })), "60")
        .map((c) => ({ t: c.timestamp!, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume }))
    : regular;
  return { bars, delayed: src.delayed };
}

/* ------------------------------------------------------------------ Email */

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function sendEmail(resend: Resend | null, to: string | undefined, symbol: string, message: string, notes: string | null) {
  if (!resend || !to) return false;
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `🔔 ${symbol} alert`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">
        <p style="font-size:17px;margin:0 0 8px"><strong>🔔 ${escapeHtml(symbol)}</strong></p>
        <p style="margin:0 0 8px">${escapeHtml(message)}</p>
        ${notes ? `<p style="margin:0 0 8px;color:#555">Your note: ${escapeHtml(notes)}</p>` : ""}
        <p style="margin:16px 0 0;color:#888;font-size:12px">Turn off email for this alert in Koinonia Trading → Alerts. This is not investment advice.</p>
      </div>`,
    });
    return true;
  } catch (e) {
    console.error("[evaluate-alerts] email failed:", e);
    return false;
  }
}

/* ------------------------------------------------------------------- Main */

/** Session hours when price alerts are checked: 4:00 am – 8:00 pm ET, weekdays. */
function inCheckWindow(now: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
      .formatToParts(new Date(now)).map((p) => [p.type, p.value]),
  );
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const open = etWallTimeToEpoch(+parts.year, +parts.month, +parts.day, 4, 0);
  const close = etWallTimeToEpoch(+parts.year, +parts.month, +parts.day, 20, 0);
  return now >= open && now <= close;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const now = Date.now();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cron = isCronCall(req);
    let onlyUser: string | null = null;
    if (!cron) {
      const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data } = await supabase.auth.getUser(jwt);
      if (!data?.user) return json({ error: "Unauthorized" }, 401);
      onlyUser = data.user.id;
    }
    if (cron && !inCheckWindow(now)) return json({ skipped: "outside 4:00 am – 8:00 pm ET" });

    const polygonKey = Deno.env.get("POLYGON_API_KEY");
    if (!polygonKey) return json({ error: "POLYGON_API_KEY is not configured" }, 500);
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resend = resendKey ? new Resend(resendKey) : null;

    let q = supabase.from("price_alerts").select("*").eq("is_active", true);
    if (onlyUser) q = q.eq("user_id", onlyUser);
    const { data: rows, error } = await q;
    if (error) throw error;

    // Eligible: one-time alerts that haven't fired; repeating alerts past their cooldown.
    const eligible = (rows as PriceAlertDb[]).filter((a) => {
      if (a.frequency === "repeat") return !a.triggered_at || now - Date.parse(a.triggered_at) >= (a.cooldown_minutes ?? 60) * MIN;
      return !a.is_triggered;
    });

    // Symbols checked longest ago go first (so a rate limit just postpones the rest).
    const bySymbol = new Map<string, PriceAlertDb[]>();
    for (const a of eligible) {
      const sym = a.symbol.toUpperCase();
      if (!bySymbol.has(sym)) bySymbol.set(sym, []);
      bySymbol.get(sym)!.push(a);
    }
    const lastChecked = (list: PriceAlertDb[]) => Math.min(...list.map((a) => (a.last_checked_at ? Date.parse(a.last_checked_at) : 0)));
    const symbols = Array.from(bySymbol.keys()).sort((x, y) => lastChecked(bySymbol.get(x)!) - lastChecked(bySymbol.get(y)!));

    const summary = { symbols: 0, checked: 0, triggered: 0, emailed: 0, skipped: 0, rateLimited: false, errors: 0 };
    const emailCache = new Map<string, string | undefined>();

    for (const sym of symbols.slice(0, MAX_SYMBOLS_PER_RUN)) {
      const alerts = bySymbol.get(sym)!;
      if (onlyUser && now - lastChecked(alerts) < MANUAL_MIN_INTERVAL_MS) {
        summary.skipped += alerts.length;
        continue;
      }
      try {
        const sinceFor = (a: PriceAlertDb) => {
          let since = a.last_checked_at ? Date.parse(a.last_checked_at) - MIN : Date.parse(a.created_at);
          // A repeating alert that just re-armed only looks at bars after its cooldown.
          if (a.frequency === "repeat" && a.triggered_at) since = Math.max(since, Date.parse(a.triggered_at) + (a.cooldown_minutes ?? 60) * MIN);
          return Math.max(since, now - MAX_LOOKBACK_MS);
        };
        const earliest = Math.min(...alerts.map(sinceFor));
        const minute = await polygonBars(polygonKey, sym, 1, "minute", earliest, now);
        let delayed = minute.delayed;
        const lastClose = minute.bars.at(-1)?.c ?? null;

        let prevClose: number | null = null;
        if (alerts.some((a) => a.alert_type === "percent_change")) prevClose = await polygonPrevClose(polygonKey, sym);

        let avgMinuteVolume: number | null = null;
        let recentMinuteBars: Bar[] = [];
        if (alerts.some((a) => a.alert_type === "volume_spike")) {
          const hist = await polygonBars(polygonKey, sym, 1, "minute", now - 8 * DAY, now);
          const today = etDateKey(now);
          const past = hist.bars.filter((b) => isRegularSessionTime(b.t) && etDateKey(b.t) !== today);
          avgMinuteVolume = past.length ? past.reduce((s, b) => s + b.v, 0) / past.length : null;
          recentMinuteBars = hist.bars.filter((b) => b.t >= now - 15 * MIN);
        }

        const tfCache = new Map<AlertTimeframe, Bar[]>();
        for (const a of alerts) {
          const tf = (a.condition?.timeframe ?? "15") as AlertTimeframe;
          if (needsTimeframeBars(a.alert_type) && !tfCache.has(tf)) {
            const r = await timeframeBars(polygonKey, sym, tf, now);
            tfCache.set(tf, r.bars);
            delayed = delayed || r.delayed;
          }
        }

        summary.symbols++;
        for (const a of alerts) {
          summary.checked++;
          const since = sinceFor(a);
          const tf = (a.condition?.timeframe ?? "15") as AlertTimeframe;
          const result = evaluateAlert(a, {
            now,
            minuteBars: minute.bars.filter((b) => b.t >= since),
            prevClose,
            tfBars: tfCache.get(tf),
            tfMs: timeframeMs(tf),
            avgMinuteVolume,
            recentMinuteBars,
          });

          if (!result.triggered) {
            await supabase.from("price_alerts")
              .update({ last_checked_at: new Date(now).toISOString(), ...(lastClose !== null ? { last_price: lastClose, current_value: lastClose } : {}) })
              .eq("id", a.id);
            continue;
          }

          const message = result.message + (delayed ? " (Market data may be delayed up to 15 minutes.)" : "");
          // Conditional update: only one run can fire a given alert.
          let upd = supabase.from("price_alerts").update({
            is_triggered: a.frequency !== "repeat",
            triggered_at: new Date(now).toISOString(),
            trigger_message: message,
            trigger_count: (a.trigger_count ?? 0) + 1,
            current_value: result.price ?? lastClose,
            last_price: lastClose,
            last_checked_at: new Date(now).toISOString(),
            notification_sent: true,
          }).eq("id", a.id).eq("updated_at", a.updated_at);
          if (a.frequency !== "repeat") upd = upd.eq("is_triggered", false);
          const { data: won } = await upd.select("id");
          if (!won?.length) continue;

          summary.triggered++;
          await supabase.from("user_notifications").insert({
            user_id: a.user_id,
            title: `🔔 ${sym} alert`,
            message,
            type: "price_alert",
            read: false,
          });
          if (a.notify_email !== false && resend) {
            if (!emailCache.has(a.user_id)) {
              const { data: u } = await supabase.auth.admin.getUserById(a.user_id);
              emailCache.set(a.user_id, u?.user?.email ?? undefined);
            }
            if (await sendEmail(resend, emailCache.get(a.user_id), sym, message, a.notes ?? null)) summary.emailed++;
          }
        }
      } catch (e) {
        if (e instanceof RateLimited) {
          summary.rateLimited = true;
          break; // remaining symbols go first next minute
        }
        summary.errors++;
        console.error(`[evaluate-alerts] ${sym}:`, e);
      }
    }
    return json(summary);
  } catch (e) {
    console.error("[evaluate-alerts] error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
