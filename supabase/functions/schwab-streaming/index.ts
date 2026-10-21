/**
 * WebSocket relay between the browser and Schwab's streamer.
 *
 * The browser can't put headers on a WebSocket, so it sends its Supabase
 * session token as a subprotocol: new WebSocket(url, ["authorization", jwt]).
 * We accept that (or a normal Authorization header), look up the user's
 * Schwab token server-side, log in to the streamer with the IDs from
 * GET /userPreference (streamerInfo is a list), and pass data through.
 *
 * The Schwab token never reaches the browser. Only market-data services are
 * allowed through, plus the user's own account activity.
 *
 * Client -> relay messages:
 *   { action: "subscribe",   service, symbols, fields }   (LEVELONE_EQUITIES etc.)
 *   { action: "unsubscribe", service, symbols }
 *   { action: "subscribe_book", symbols }      Level 2: NASDAQ_BOOK + NYSE_BOOK
 *   { action: "unsubscribe_book" }
 *   { action: "subscribe_account" }
 *   { action: "ping" }
 * Relay -> client:
 *   { type: "connected" } | { type: "data", service, content, timestamp }
 *   { type: "error", message } | { type: "disconnected", code, reason } | { type: "pong" }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSchwabAccessToken } from "../_shared/schwab-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCHWAB_API = "https://api.schwabapi.com/trader/v1";
const DEFAULT_STREAMER_URL = "wss://streamer-api.schwab.com/ws";

/** Services a browser may subscribe to through the relay. */
const ALLOWED_SERVICES = new Set([
  "LEVELONE_EQUITIES",
  "LEVELONE_OPTIONS",
  "LEVELONE_FUTURES",
  "CHART_EQUITY",
  "NASDAQ_BOOK",
  "NYSE_BOOK",
  "OPTIONS_BOOK",
]);
const BOOK_SERVICES = ["NASDAQ_BOOK", "NYSE_BOOK"] as const;
/** Fields 0-3: symbol, book time, bids, asks. */
const BOOK_FIELDS = "0,1,2,3";
const MAX_SYMBOLS = 300;
/** Level 2 is heavy: a few symbols at a time is plenty for charts. */
const MAX_BOOK_SYMBOLS = 5;

const SYMBOL_RE = /^[A-Z0-9./$_-]{1,32}$/;

export interface StreamerInfo {
  streamerSocketUrl?: string;
  schwabClientCustomerId?: string;
  schwabClientCorrelId?: string;
  schwabClientChannel?: string;
  schwabClientFunctionId?: string;
}

/** userPreference returns streamerInfo as a list; older code read it as an object. */
export function pickStreamerInfo(prefs: unknown): StreamerInfo | null {
  const raw = (prefs as { streamerInfo?: unknown } | null)?.streamerInfo;
  const info = (Array.isArray(raw) ? raw[0] : raw) as StreamerInfo | undefined;
  if (!info || typeof info !== "object" || !info.schwabClientCustomerId || !info.schwabClientCorrelId) return null;
  return info;
}

/** The user's Supabase JWT: Authorization header, or the WebSocket subprotocol pair. */
export function readJwt(req: Request): { jwt: string | null; viaProtocol: boolean } {
  const header = req.headers.get("authorization");
  if (header && /^Bearer\s+\S+/i.test(header)) return { jwt: header.replace(/^Bearer\s+/i, "").trim(), viaProtocol: false };
  const protocols = (req.headers.get("sec-websocket-protocol") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const i = protocols.findIndex((p) => p.toLowerCase() === "authorization");
  if (i >= 0 && protocols[i + 1]) return { jwt: protocols[i + 1], viaProtocol: true };
  return { jwt: new URL(req.url).searchParams.get("token"), viaProtocol: false };
}

const cleanSymbols = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? Array.from(new Set(v.map((s) => String(s ?? "").trim().toUpperCase()).filter((s) => SYMBOL_RE.test(s)))).slice(0, max)
    : [];

const cleanFields = (v: unknown, fallback: string): string =>
  typeof v === "string" && /^\d{1,3}(,\d{1,3}){0,80}$/.test(v) ? v : fallback;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if ((req.headers.get("upgrade") ?? "").toLowerCase() !== "websocket") {
    return json({ message: "Schwab streaming relay. Connect with a WebSocket.", services: Array.from(ALLOWED_SERVICES) });
  }

  const { jwt, viaProtocol } = readJwt(req);
  if (!jwt) return new Response("Unauthorized", { status: 401 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (userError || !user) return new Response("Unauthorized", { status: 401 });

  const accessToken = await getSchwabAccessToken(admin, user.id).catch(() => null);
  if (!accessToken) return json({ error: "Schwab is not connected. Connect it in Settings." }, 403);

  let info: StreamerInfo | null = null;
  try {
    const res = await fetch(`${SCHWAB_API}/userPreference`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    if (res.ok) info = pickStreamerInfo(await res.json());
  } catch {
    info = null;
  }
  if (!info) return json({ error: "Could not get streaming details from Schwab." }, 502);

  // The browser offered ["authorization", jwt]: we must pick one, or it drops the connection.
  const { socket: client, response } = Deno.upgradeWebSocket(req, viaProtocol ? { protocol: "authorization" } : {});

  const streamerUrl = info.streamerSocketUrl && /^wss:\/\//.test(info.streamerSocketUrl) ? info.streamerSocketUrl : DEFAULT_STREAMER_URL;
  let schwab: WebSocket | null = null;
  let authenticated = false;
  let seq = 1;
  let closed = false;

  const sendClient = (msg: unknown) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(msg));
  };
  const request = (service: string, command: string, parameters: Record<string, unknown>) => ({
    service,
    command,
    requestid: String(seq++),
    SchwabClientCustomerId: info!.schwabClientCustomerId,
    SchwabClientCorrelId: info!.schwabClientCorrelId,
    parameters,
  });
  const sendSchwab = (...requests: unknown[]) => {
    if (schwab && schwab.readyState === WebSocket.OPEN) schwab.send(JSON.stringify({ requests }));
  };

  const shutdown = () => {
    if (closed) return;
    closed = true;
    try {
      if (schwab && schwab.readyState === WebSocket.OPEN) {
        sendSchwab(request("ADMIN", "LOGOUT", {}));
        schwab.close();
      }
    } catch { /* ignore */ }
    try {
      if (client.readyState === WebSocket.OPEN) client.close();
    } catch { /* ignore */ }
  };

  client.onopen = () => {
    schwab = new WebSocket(streamerUrl);

    schwab.onopen = () => {
      sendSchwab(
        request("ADMIN", "LOGIN", {
          Authorization: accessToken,
          SchwabClientChannel: info!.schwabClientChannel ?? "",
          SchwabClientFunctionId: info!.schwabClientFunctionId ?? "",
        }),
      );
    };

    schwab.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(typeof event.data === "string" ? event.data : "");
      } catch {
        return;
      }
      for (const resp of data?.response ?? []) {
        if (resp.service === "ADMIN" && resp.command === "LOGIN") {
          if (resp.content?.code === 0) {
            authenticated = true;
            // Fastest delivery (500 ms conflation).
            sendSchwab(request("ADMIN", "QOS", { qoslevel: "0" }));
            sendClient({ type: "connected", message: "Schwab streaming connected" });
          } else {
            sendClient({ type: "error", message: `Schwab streaming login failed${resp.content?.msg ? `: ${resp.content.msg}` : ""}` });
            shutdown();
          }
        } else if (resp.content?.code && resp.content.code !== 0) {
          // e.g. not entitled to a service (Level 2 needs the account's market-data agreement).
          sendClient({ type: "error", service: resp.service, code: resp.content.code, message: resp.content.msg ?? "Request failed" });
        }
      }
      for (const item of data?.data ?? []) {
        sendClient({ type: "data", service: item.service, content: item.content, timestamp: Date.now() });
      }
      for (const n of data?.notify ?? []) {
        // Schwab closes the session with a notify (e.g. another login elsewhere).
        if (n?.content?.code && n.content.code !== 0) sendClient({ type: "error", message: n.content.msg ?? "Schwab ended the stream" });
      }
    };

    schwab.onerror = () => sendClient({ type: "error", message: "Schwab streaming error" });
    schwab.onclose = (event) => {
      authenticated = false;
      sendClient({ type: "disconnected", code: event.code, reason: event.reason || "Connection closed" });
      shutdown();
    };
  };

  client.onmessage = (event) => {
    let msg: any;
    try {
      msg = JSON.parse(typeof event.data === "string" ? event.data : "");
    } catch {
      return;
    }
    if (msg?.action === "ping") {
      sendClient({ type: "pong", timestamp: Date.now() });
      return;
    }
    if (!authenticated) {
      sendClient({ type: "error", message: "Not connected to Schwab yet" });
      return;
    }
    switch (msg?.action) {
      case "subscribe":
      case "subscribe_chart":
      case "subscribe_orders": {
        const service = msg.action === "subscribe" ? String(msg.service ?? "LEVELONE_EQUITIES") : "LEVELONE_EQUITIES";
        if (!ALLOWED_SERVICES.has(service)) {
          sendClient({ type: "error", message: `Service not allowed: ${service}` });
          return;
        }
        const keys = cleanSymbols(msg.symbols, MAX_SYMBOLS);
        if (!keys.length) return;
        sendSchwab(request(service, "SUBS", { keys: keys.join(","), fields: cleanFields(msg.fields, "0,1,2,3,4,5,8,9,10,11,12,17,18,33,34,35,42") }));
        return;
      }
      case "unsubscribe": {
        const service = String(msg.service ?? "LEVELONE_EQUITIES");
        if (!ALLOWED_SERVICES.has(service)) return;
        const keys = cleanSymbols(msg.symbols, MAX_SYMBOLS);
        if (keys.length) sendSchwab(request(service, "UNSUBS", { keys: keys.join(",") }));
        return;
      }
      case "subscribe_book": {
        const keys = cleanSymbols(msg.symbols, MAX_BOOK_SYMBOLS);
        if (!keys.length) return;
        // SUBS replaces the previous list for that service.
        sendSchwab(...BOOK_SERVICES.map((s) => request(s, "SUBS", { keys: keys.join(","), fields: BOOK_FIELDS })));
        return;
      }
      case "unsubscribe_book": {
        const keys = cleanSymbols(msg.symbols, MAX_BOOK_SYMBOLS);
        if (keys.length) sendSchwab(...BOOK_SERVICES.map((s) => request(s, "UNSUBS", { keys: keys.join(",") })));
        return;
      }
      case "subscribe_account": {
        sendSchwab(request("ACCT_ACTIVITY", "SUBS", { keys: info!.schwabClientCorrelId, fields: "0,1,2,3" }));
        return;
      }
      default:
        return;
    }
  };

  // Keep this function running until the browser hangs up. Without this the
  // runtime treats the request as finished once the upgrade returns and may
  // shut the worker down, which drops the socket ("connection lost").
  let done: () => void = () => {};
  const finished = new Promise<void>((r) => (done = r));
  (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(finished);
  client.onclose = () => {
    shutdown();
    done();
  };
  client.onerror = () => {};

  return response;
});
