/**
 * Bridge between the browser and PocketOption's live socket.
 *
 * The browser connects here (WebSocket) with its Supabase sign-in, sent as
 * the subprotocol pair ["authorization", <jwt>] (or ?token= for older
 * clients). We look up the user's saved PocketOption SSID, connect to
 * PocketOption with the headers it requires (Origin, User-Agent), run the
 * socket.io protocol (../_shared/pocketoption-protocol.ts), and pass
 * normalized messages on: po_authenticated, po_balance, po_ticks (live
 * prices), po_candles (history), po_order_opened, po_deals_closed...
 *
 * Trades always use the account type of the saved SSID (demo or real); the
 * browser can't switch it.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { safeDecrypt } from "../_shared/encryption.ts";
import { RawWebSocket } from "../_shared/ws-client.ts";
import {
  PO_HEADERS,
  PoSession,
  changeSymbolFrame,
  endpointUrl,
  endpointsFor,
  openOrderFrame,
  parseSsid,
  validateTrade,
  type PoEvent,
} from "../_shared/pocketoption-protocol.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, upgrade, connection",
};

/** Per endpoint: how long to wait for the socket.io handshake + login. */
const ENDPOINT_TIMEOUT_MS = 10_000;

function readToken(req: Request): { token: string | null; viaProtocol: boolean } {
  const protocols = (req.headers.get("sec-websocket-protocol") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const i = protocols.findIndex((p) => p.toLowerCase() === "authorization");
  if (i >= 0 && protocols[i + 1]) return { token: protocols[i + 1], viaProtocol: true };
  return { token: new URL(req.url).searchParams.get("token"), viaProtocol: false };
}

/** Endpoints to try. PO_TEST_ENDPOINTS (comma-separated ws URLs) is for tests only. */
function endpointList(isDemo: 0 | 1): string[] {
  const test = Deno.env.get("PO_TEST_ENDPOINTS");
  if (test) return test.split(",").map((s) => s.trim()).filter(Boolean);
  return endpointsFor(isDemo).map(endpointUrl);
}

/** One readable sentence about why no PocketOption server worked. */
export function summarizeFailures(failures: Array<{ host: string; why: string }>): string {
  if (!failures.length) return "Couldn't reach PocketOption.";
  const refused = failures.filter((f) => /HTTP 40[13]/.test(f.why)).length;
  const head = `Couldn't connect to PocketOption (tried ${failures.length} servers).`;
  if (refused === failures.length) {
    return `${head} Every server refused the app's server (${failures[0].why}). PocketOption blocks some countries and data centers; the app's server may be in one of them.`;
  }
  const sample = failures.slice(0, 3).map((f) => `${f.host}: ${f.why}`).join("; ");
  return `${head} ${sample}${failures.length > 3 ? "; …" : ""}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if ((req.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400, headers: corsHeaders });
  }

  const { token, viaProtocol } = readToken(req);

  // Problems found before PocketOption is even contacted. A browser can't read
  // an HTTP error on a WebSocket (it just sees "closed"), so we accept the
  // socket and send the reason as a message instead.
  let setupError: { code: string; message: string } | null = null;
  let ssidRaw: string | null = null;
  if (!token) setupError = { code: "NOT_SIGNED_IN", message: "You're not signed in. Sign in again and reconnect." };
  else {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) setupError = { code: "NOT_SIGNED_IN", message: "Your sign-in expired. Refresh the page and reconnect." };
    else {
      const { data: creds, error: credError } = await supabase.from("user_api_credentials").select("pocketoption_ssid").eq("user_id", user.id).maybeSingle();
      if (credError) setupError = { code: "NO_SSID", message: `Couldn't read your saved SSID: ${credError.message}` };
      else {
        ssidRaw = creds?.pocketoption_ssid ? ((await safeDecrypt(creds.pocketoption_ssid)) as string) : null;
        if (!ssidRaw) setupError = { code: "NO_SSID", message: "No PocketOption SSID is saved yet. Paste it in the Connection tab and press Save." };
      }
    }
  }
  const auth = ssidRaw ? parseSsid(ssidRaw) : null;

  const { socket, response } = Deno.upgradeWebSocket(req, viaProtocol ? { protocol: "authorization" } : {});

  const toClient = (msg: Record<string, unknown>) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  };

  let po: RawWebSocket | null = null;
  let session: PoSession | null = null;
  let closed = false;
  let attemptTimer: ReturnType<typeof setTimeout> | null = null;
  /** Latest watched asset, re-sent after (re)login. */
  let watching: { asset: string; period: number } | null = null;

  const stopTimers = () => {
    if (attemptTimer) clearTimeout(attemptTimer);
    attemptTimer = null;
  };

  const connect = () => {
    if (setupError) {
      toClient({ type: "error", ...setupError });
      return;
    }
    if (!auth) {
      toClient({ type: "error", code: "BAD_SSID", message: "Your saved SSID isn't the full auth message. In PocketOption, open DevTools > Network > WS, find the message that starts with 42[\"auth\", copy all of it and save it in Settings." });
      return;
    }
    const endpoints = endpointList(auth.isDemo);
    /** Why each server failed, for a useful final message. */
    const failures: Array<{ host: string; why: string }> = [];

    const tryEndpoint = (i: number) => {
      if (closed) return;
      if (i >= endpoints.length) {
        toClient({ type: "error", code: "NO_ENDPOINT", message: summarizeFailures(failures), failures });
        return;
      }
      const url = endpoints[i];
      const host = url.replace(/^wss?:\/\/([^/]+).*$/, "$1");
      toClient({ type: "connection_attempt", endpoint: host, attemptNumber: i + 1, totalEndpoints: endpoints.length });

      // Our own WebSocket client: Supabase's runtime can't send the Origin
      // header PocketOption requires with the built-in one.
      const ws = new RawWebSocket(url, { headers: PO_HEADERS, timeoutMs: ENDPOINT_TIMEOUT_MS });
      po = ws;
      let gaveUp = false;
      let lastProblem = "";
      const next = (why?: string) => {
        if (gaveUp || closed) return;
        gaveUp = true;
        stopTimers();
        failures.push({ host, why: why || lastProblem || "no reply" });
        console.warn("[po]", host, "failed:", why || lastProblem);
        try { ws.close(); } catch { /* ignore */ }
        tryEndpoint(i + 1);
      };

      const s = new PoSession(
        auth,
        (frame) => { if (ws.readyState === RawWebSocket.OPEN) ws.send(frame); },
        (e: PoEvent) => {
          if (e.type === "po_connected") {
            toClient({ type: "connection", status: "connected", endpoint: host, message: "Connected to PocketOption, logging in…" });
          } else if (e.type === "po_authenticated") {
            if (attemptTimer) clearTimeout(attemptTimer);
            attemptTimer = null;
            toClient({ type: "po_authenticated", isDemo: e.isDemo, endpoint: host });
            if (watching) ws.send(changeSymbolFrame(watching.asset, watching.period));
          } else if (e.type === "po_auth_failed") {
            // A login problem won't be fixed by another server: stop here.
            gaveUp = true;
            stopTimers();
            toClient({ type: "error", code: "AUTH_FAILED", message: e.reason });
            try { ws.close(); } catch { /* ignore */ }
          } else {
            toClient(e as unknown as Record<string, unknown>);
          }
        },
        (...a) => console.warn("[po]", ...a),
      );
      session = s;

      // No login within the time limit: try the next server.
      attemptTimer = setTimeout(() => {
        if (!s.authenticated) next(s.connected ? "connected but no reply to the login" : "no reply in time");
      }, ENDPOINT_TIMEOUT_MS + 2_000);

      ws.onmessage = (ev) => s.handle(ev.data);
      ws.onerror = (ev) => { lastProblem = ev.message; };
      ws.onclose = (ev) => {
        if (!s.authenticated) { next(lastProblem || `closed (${ev.code}${ev.reason ? ` ${ev.reason}` : ""})`); return; }
        stopTimers();
        toClient({ type: "connection", status: "disconnected", message: "PocketOption closed the connection", closeCode: ev.code });
        // Let the browser reconnect (it backs off); this bridge is done.
        try { socket.close(); } catch { /* ignore */ }
      };
      // Keep-alive: PocketOption pings ("2") and the session answers ("3").
    };

    tryEndpoint(0);
  };

  socket.onopen = () => toClient({ type: "authenticated", message: "Ready to connect to PocketOption", isDemo: auth?.isDemo ?? null });

  socket.onmessage = (event) => {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(typeof event.data === "string" ? event.data : "");
    } catch {
      return;
    }
    switch (m.type) {
      case "connect":
        if (!po || po.readyState > 1) connect();
        return;
      case "ping":
        toClient({ type: "pong" });
        return;
      case "subscribe_candles": {
        const asset = String(m.asset ?? "");
        if (!/^#?[A-Za-z0-9_.]{2,24}$/.test(asset)) return;
        watching = { asset, period: Number(m.period) > 0 ? Number(m.period) : 60 };
        if (po && session?.authenticated) po.send(changeSymbolFrame(watching.asset, watching.period));
        return;
      }
      case "trade": {
        if (!po || !session?.authenticated || !auth) {
          toClient({ type: "error", code: "NOT_READY", message: "Not logged in to PocketOption yet." });
          return;
        }
        const v = validateTrade(m);
        if (!v.ok) {
          toClient({ type: "po_order_failed", reason: v.reason });
          return;
        }
        const requestId = crypto.randomUUID();
        po.send(openOrderFrame({ ...v, isDemo: auth.isDemo, requestId }));
        toClient({ type: "trade_sent", requestId, asset: v.asset, action: v.action, amount: v.amount, isDemo: auth.isDemo });
        return;
      }
      case "change_balance":
        toClient({ type: "error", code: "SWITCH_ACCOUNT", message: "To switch between demo and real, save the SSID from that account in Settings and reconnect." });
        return;
      case "get_balance":
        return; // PocketOption sends the balance after login and after every trade.
    }
  };

  socket.onclose = () => {
    closed = true;
    stopTimers();
    try { po?.close(); } catch { /* ignore */ }
  };
  socket.onerror = () => {};

  return response;
});
