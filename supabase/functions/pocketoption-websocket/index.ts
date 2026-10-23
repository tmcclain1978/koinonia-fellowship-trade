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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

/** PocketOption hung up right after receiving the SSID. */
export function loginRejectedMessage(isDemo: 0 | 1): string {
  return isDemo === 0
    ? "PocketOption reached, but it rejected your saved SSID. It is from your REAL money account. A real-account SSID is tied to the browser and internet connection it came from, so PocketOption refuses it from the app's server. Save the SSID from your DEMO account instead, or copy a fresh real one and try right away."
    : "PocketOption reached, but it rejected your saved SSID. It has probably expired (they change when you log out or log in again). Copy a fresh one from PocketOption and save it.";
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

type Msg = Record<string, unknown>;

/** Who's asking, and their saved SSID; or why we can't go on. */
async function loadUser(token: string | null): Promise<{ setupError: { code: string; message: string } | null; ssidRaw: string | null }> {
  if (!token) return { setupError: { code: "NOT_SIGNED_IN", message: "You're not signed in. Sign in again and reconnect." }, ssidRaw: null };
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return { setupError: { code: "NOT_SIGNED_IN", message: "Your sign-in expired. Refresh the page and reconnect." }, ssidRaw: null };
  const { data: creds, error: credError } = await supabase.from("user_api_credentials").select("pocketoption_ssid").eq("user_id", user.id).maybeSingle();
  if (credError) return { setupError: { code: "NO_SSID", message: `Couldn't read your saved SSID: ${credError.message}` }, ssidRaw: null };
  const ssidRaw = creds?.pocketoption_ssid ? ((await safeDecrypt(creds.pocketoption_ssid)) as string) : null;
  if (!ssidRaw) return { setupError: { code: "NO_SSID", message: "No PocketOption SSID is saved yet. Paste it in the Connection tab and press Save." }, ssidRaw: null };
  return { setupError: null, ssidRaw };
}

/**
 * The PocketOption side of the bridge. `toClient` receives every message for
 * the browser; `handle` takes the browser's messages; `close` hangs up.
 * Shared by the live WebSocket and the "Test connection" check.
 */
export function createBridge(ssidRaw: string | null, setupError: { code: string; message: string } | null, toClient: (m: Msg) => void, onPoClosed: () => void = () => {}) {
  const auth = ssidRaw ? parseSsid(ssidRaw) : null;
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
            stopTimers();
            if (watching) ws.send(changeSymbolFrame(watching.asset, watching.period));
            toClient({ type: "po_authenticated", isDemo: e.isDemo, endpoint: host });
          } else if (e.type === "po_auth_failed") {
            // A login problem won't be fixed by another server: stop here.
            gaveUp = true;
            stopTimers();
            toClient({ type: "error", code: "AUTH_FAILED", message: e.reason });
            try { ws.close(); } catch { /* ignore */ }
          } else {
            toClient(e as unknown as Msg);
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
        if (!s.authenticated && s.connected && !gaveUp && !closed) {
          // PocketOption let us in, got the SSID, and hung up without a word:
          // it rejected the login. Another server will do the same.
          gaveUp = true;
          stopTimers();
          toClient({ type: "error", code: "LOGIN_REJECTED", endpoint: host, message: loginRejectedMessage(auth.isDemo) });
          return;
        }
        if (!s.authenticated) { next(lastProblem || `closed (${ev.code}${ev.reason ? ` ${ev.reason}` : ""})`); return; }
        stopTimers();
        toClient({ type: "connection", status: "disconnected", message: "PocketOption closed the connection", closeCode: ev.code });
        onPoClosed();
      };
      // Keep-alive: PocketOption pings ("2") and the session answers ("3").
    };

    tryEndpoint(0);
  };

  const handle = (m: Msg) => {
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

  const close = () => {
    closed = true;
    stopTimers();
    try { po?.close(); } catch { /* ignore */ }
  };

  return { isDemo: auth?.isDemo ?? null, handle, close };
}

/** Longest the "Test connection" check runs. */
const DIAGNOSE_BUDGET_MS = 60_000;

/**
 * "Test connection": runs the whole login from the server and reports each
 * step, then waits briefly for prices and candles on `asset`. Plain HTTP, so
 * the browser always gets an answer even when a WebSocket would just close.
 */
export function diagnose(ssidRaw: string | null, setupError: { code: string; message: string } | null, asset: string, budgetMs = DIAGNOSE_BUDGET_MS): Promise<Msg> {
  return new Promise((resolve) => {
    const steps: Msg[] = [];
    let loggedIn = false;
    let ticks = 0;
    let candles = 0;
    let balance: number | null = null;
    let finished = false;
    let dataTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = (ok: boolean, summary: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(budget);
      if (dataTimer) clearTimeout(dataTimer);
      bridge.close();
      resolve({ ok, summary, loggedIn, isDemo: bridge.isDemo, balance, ticks, candles, asset, steps });
    };
    const report = () =>
      finish(ticks + candles > 0, ticks + candles > 0
        ? `Logged in and receiving data: ${candles} candles and ${ticks} live prices for ${asset}.`
        : `Logged in, but no prices for ${asset} arrived in 10 seconds. The asset may be closed; try another one.`);
    /** Once data flows, collect for 3 more seconds, then report. */
    let collecting = false;
    const dataSeen = () => {
      if (collecting || !loggedIn) return;
      collecting = true;
      if (dataTimer) clearTimeout(dataTimer);
      dataTimer = setTimeout(report, 3_000);
    };
    const bridge = createBridge(ssidRaw, setupError, (m) => {
      if (m.type === "po_ticks") { ticks += Array.isArray(m.ticks) ? m.ticks.length : 0; dataSeen(); }
      else if (m.type === "po_candles") { candles += Array.isArray(m.candles) ? m.candles.length : 0; dataSeen(); }
      else if (m.type === "po_balance") { balance = typeof m.balance === "number" ? m.balance : balance; steps.push({ type: m.type, balance }); }
      else steps.push(m);
      if (m.type === "error") finish(false, String(m.message ?? "Failed"));
      else if (m.type === "po_authenticated") {
        loggedIn = true;
        bridge.handle({ type: "subscribe_candles", asset, period: 60 });
        dataTimer = setTimeout(report, 10_000);
      } else if (m.type === "connection" && m.status === "disconnected") finish(loggedIn, "PocketOption closed the connection.");
    });
    const budget = setTimeout(() => finish(loggedIn, loggedIn ? "Logged in, but ran out of time waiting for data." : "Ran out of time trying PocketOption's servers."), budgetMs);
    bridge.handle({ type: "connect" });
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // "Test connection" (plain HTTP POST with the usual Authorization header).
  if (req.method === "POST") {
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || null;
    const body = await req.json().catch(() => ({})) as Msg;
    const asset = /^#?[A-Za-z0-9_.]{2,24}$/.test(String(body.asset ?? "")) ? String(body.asset) : "EURUSD_otc";
    const { setupError, ssidRaw } = await loadUser(bearer);
    const result = await diagnose(ssidRaw, setupError, asset);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if ((req.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400, headers: corsHeaders });
  }

  const { token, viaProtocol } = readToken(req);
  // Problems found before PocketOption is even contacted. A browser can't read
  // an HTTP error on a WebSocket (it just sees "closed"), so we accept the
  // socket and send the reason as a message instead.
  const { setupError, ssidRaw } = await loadUser(token);

  const { socket, response } = Deno.upgradeWebSocket(req, viaProtocol ? { protocol: "authorization" } : {});

  const toClient = (msg: Msg) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  };
  // When PocketOption hangs up after login, end this bridge; the browser reconnects.
  const bridge = createBridge(ssidRaw, setupError, toClient, () => { try { socket.close(); } catch { /* ignore */ } });

  // Keep this function running until the browser hangs up. Without this the
  // runtime treats the request as finished once the upgrade returns and may
  // shut the worker down, which drops the socket ("connection lost").
  let done: () => void = () => {};
  const finished = new Promise<void>((r) => (done = r));
  (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(finished);

  socket.onopen = () => toClient({ type: "authenticated", message: "Ready to connect to PocketOption", isDemo: bridge.isDemo });
  socket.onmessage = (event) => {
    let m: Msg;
    try {
      m = JSON.parse(typeof event.data === "string" ? event.data : "");
    } catch {
      return;
    }
    bridge.handle(m);
  };
  socket.onclose = () => {
    bridge.close();
    done();
  };
  socket.onerror = () => {};

  return response;
});
