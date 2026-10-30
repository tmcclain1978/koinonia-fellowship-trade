// collect-pocketoption-candles: keeps saving PocketOption candles while the
// app is closed, so the Pattern Engine has a long, gap-free history.
//
//   - Scheduled (pg_cron, every 30 minutes): every user's watched assets.
//   - Called by a signed-in user: just their watched assets (or { asset }).
//
// For each asset it logs in with the user's saved SSID, asks PocketOption
// for the 1-minute candles since the newest one already saved (first run:
// the last `FIRST_RUN_DAYS` days), and saves them, skipping any already there.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isCronCall, isInternalCall, getAuthedUser } from "../_shared/internal-auth.ts";
import { safeDecrypt } from "../_shared/encryption.ts";
import { type Candle, endpointUrl, endpointsFor, parseSsid } from "../_shared/pocketoption-protocol.ts";
import { PoLoginError, fetchHistory, openPoSession } from "../_shared/po-connection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-secret",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FIRST_RUN_DAYS = 7;
const MAX_DAYS = 30;
/** Stop starting new work after this long (edge functions are cut off at ~150 s). */
const BUDGET_MS = 110_000;
const MAX_ASSETS_PER_USER = 10;
const ASSET_RE = /^#?[A-Za-z0-9_.]{2,24}$/;

/** Rows for pocketoption_candles; the candle still forming is left out. */
export function candleRows(userId: string, asset: string, candles: Candle[], nowMs: number) {
  const thisMinute = Math.floor(nowMs / 60_000) * 60_000;
  return candles
    .filter((c) => c.time < thisMinute)
    .map((c) => ({
      user_id: userId,
      pair: asset,
      timeframe: "1m",
      timestamp: new Date(c.time).toISOString(),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? null,
      direction: c.close > c.open ? "up" : c.close < c.open ? "down" : "neutral",
    }));
}

/** Endpoints to try. PO_TEST_ENDPOINTS (comma-separated ws URLs) is for tests only. */
function endpointList(isDemo: 0 | 1): string[] {
  const test = Deno.env.get("PO_TEST_ENDPOINTS");
  if (test) return test.split(",").map((s) => s.trim()).filter(Boolean);
  return endpointsFor(isDemo).map(endpointUrl);
}

type Admin = ReturnType<typeof createClient>;

async function collectUser(admin: Admin, userId: string, assets: string[], deadline: number) {
  const results: Array<{ asset: string; saved: number; error?: string }> = [];
  const mark = (asset: string, patch: Record<string, unknown>) =>
    admin.from("pocketoption_watch").update({ last_run_at: new Date().toISOString(), ...patch }).eq("user_id", userId).eq("asset", asset);

  const { data: creds } = await admin.from("user_api_credentials").select("pocketoption_ssid").eq("user_id", userId).maybeSingle();
  const raw = creds?.pocketoption_ssid ? await safeDecrypt(creds.pocketoption_ssid) : null;
  const auth = raw ? parseSsid(raw) : null;
  if (!auth) {
    const error = raw ? "Saved SSID isn't the full auth message." : "No PocketOption SSID saved.";
    for (const a of assets) {
      await mark(a, { last_error: error, last_count: 0 });
      results.push({ asset: a, saved: 0, error });
    }
    return results;
  }

  let conn;
  try {
    conn = await openPoSession(auth, endpointList(auth.isDemo));
  } catch (e) {
    const error = e instanceof PoLoginError && e.code !== "NO_ENDPOINT" ? `${e.message} Save a fresh SSID from your demo account.` : (e as Error).message;
    for (const a of assets) {
      await mark(a, { last_error: error, last_count: 0 });
      results.push({ asset: a, saved: 0, error });
    }
    return results;
  }

  try {
    for (const asset of assets) {
      if (Date.now() > deadline) {
        results.push({ asset, saved: 0, error: "Out of time; the next run continues." });
        continue;
      }
      const nowMs = Date.now();
      const { data: newest } = await admin.from("pocketoption_candles").select("timestamp").eq("user_id", userId).eq("pair", asset).eq("timeframe", "1m").order("timestamp", { ascending: false }).limit(1).maybeSingle();
      const sinceSec = newest ? Math.floor(new Date(newest.timestamp).getTime() / 1000) : Math.floor(nowMs / 1000) - FIRST_RUN_DAYS * 86400;
      const untilSec = Math.max(sinceSec, Math.floor(nowMs / 1000) - MAX_DAYS * 86400);
      let saved = 0;
      let newestSaved: number | null = null;
      try {
        await fetchHistory(conn, asset, Math.floor(nowMs / 1000), untilSec, async (page) => {
          const rows = candleRows(userId, asset, page, Date.now());
          if (!rows.length) return;
          const { error } = await admin.from("pocketoption_candles").upsert(rows, { onConflict: "user_id,pair,timeframe,timestamp", ignoreDuplicates: true });
          if (error) throw new Error(`Saving failed: ${error.message}`);
          saved += rows.length;
          newestSaved = Math.max(newestSaved ?? 0, ...page.map((c) => c.time));
        });
        await mark(asset, { last_error: null, last_count: saved, ...(newestSaved ? { last_candle_at: new Date(newestSaved).toISOString() } : {}) });
        results.push({ asset, saved });
      } catch (e) {
        await mark(asset, { last_error: (e as Error).message, last_count: saved });
        results.push({ asset, saved, error: (e as Error).message });
        if (!conn.open) break;
      }
    }
  } finally {
    conn.close();
  }
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const scheduled = isCronCall(req) || isInternalCall(req);
  let onlyUser: string | null = null;
  if (!scheduled) {
    const user = (await getAuthedUser(req, admin)) as { id: string } | null;
    if (!user) return json({ error: "Unauthorized" }, 401);
    onlyUser = user.id;
  }
  const body = (await req.json().catch(() => ({}))) as { asset?: string };
  const deadline = Date.now() + BUDGET_MS;

  let q = admin.from("pocketoption_watch").select("user_id, asset").eq("enabled", true);
  if (onlyUser) q = q.eq("user_id", onlyUser);
  const { data: watch, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const byUser = new Map<string, string[]>();
  for (const w of watch ?? []) {
    if (!ASSET_RE.test(w.asset)) continue;
    const list = byUser.get(w.user_id) ?? [];
    if (list.length < MAX_ASSETS_PER_USER) list.push(w.asset);
    byUser.set(w.user_id, list);
  }
  // A user can ask for one asset right now even if it isn't on the watch list.
  if (onlyUser && body.asset && ASSET_RE.test(body.asset)) {
    const list = byUser.get(onlyUser) ?? [];
    byUser.set(onlyUser, [body.asset, ...list.filter((a) => a !== body.asset)]);
  }

  const out: Record<string, unknown> = {};
  let saved = 0;
  for (const [uid, assets] of byUser) {
    if (Date.now() > deadline) break;
    try {
      const r = await collectUser(admin, uid, assets, deadline);
      saved += r.reduce((a, x) => a + x.saved, 0);
      if (onlyUser) out.assets = r;
    } catch (e) {
      console.error(`[collect-po] ${uid}:`, (e as Error).message);
      if (onlyUser) return json({ error: (e as Error).message }, 500);
    }
  }
  return json({ saved, users: byUser.size, ...out });
});
