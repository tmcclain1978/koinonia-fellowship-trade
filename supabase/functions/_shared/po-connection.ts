/**
 * Open a logged-in PocketOption session from the server (no browser), for
 * jobs like the background candle collector. Tries each server in turn,
 * like the live bridge, and stops at once if the login itself is refused.
 */
import { RawWebSocket } from "./ws-client.ts";
import { type AuthInfo, type Candle, HistoryPager, PO_HEADERS, PoSession, type PoEvent } from "./pocketoption-protocol.ts";

export class PoLoginError extends Error {
  constructor(readonly code: "AUTH_FAILED" | "LOGIN_REJECTED" | "NO_ENDPOINT", message: string) {
    super(message);
  }
}

export interface PoConnection {
  host: string;
  send(frame: string): void;
  /** Listen to everything PocketOption sends (normalized). Returns unsubscribe. */
  on(l: (e: PoEvent) => void): () => void;
  close(): void;
  readonly open: boolean;
}

export async function openPoSession(auth: AuthInfo, endpoints: string[], timeoutMs = 10_000): Promise<PoConnection> {
  const failures: string[] = [];
  for (const url of endpoints) {
    const host = url.replace(/^wss?:\/\/([^/]+).*$/, "$1");
    try {
      return await tryOne(auth, url, host, timeoutMs);
    } catch (e) {
      if (e instanceof PoLoginError && e.code !== "NO_ENDPOINT") throw e;
      failures.push(`${host}: ${(e as Error).message}`);
    }
  }
  throw new PoLoginError("NO_ENDPOINT", `Couldn't reach PocketOption (${failures.slice(0, 3).join("; ")})`);
}

function tryOne(auth: AuthInfo, url: string, host: string, timeoutMs: number): Promise<PoConnection> {
  return new Promise((resolve, reject) => {
    const listeners = new Set<(e: PoEvent) => void>();
    const ws = new RawWebSocket(url, { headers: PO_HEADERS, timeoutMs });
    let settled = false;
    let lastProblem = "";
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      reject(err);
    };
    const session = new PoSession(
      auth,
      (f) => { if (ws.readyState === RawWebSocket.OPEN) ws.send(f); },
      (e) => {
        if (!settled) {
          if (e.type === "po_authenticated") {
            settled = true;
            clearTimeout(timer);
            resolve({
              host,
              send: (f) => { if (ws.readyState === RawWebSocket.OPEN) ws.send(f); },
              on: (l) => { listeners.add(l); return () => listeners.delete(l); },
              close: () => { try { ws.close(); } catch { /* ignore */ } },
              get open() { return ws.readyState === RawWebSocket.OPEN; },
            });
          } else if (e.type === "po_auth_failed") fail(new PoLoginError("AUTH_FAILED", e.reason));
          return;
        }
        listeners.forEach((l) => l(e));
      },
    );
    const timer = setTimeout(() => fail(new Error(session.connected ? "connected but no reply to the login" : lastProblem || "no reply in time")), timeoutMs + 2_000);
    ws.onmessage = (ev) => session.handle(ev.data);
    ws.onerror = (ev) => { lastProblem = ev.message; };
    ws.onclose = (ev) => {
      if (settled) return;
      if (session.connected) fail(new PoLoginError("LOGIN_REJECTED", "PocketOption rejected the saved SSID (it may be expired, or from a real-money account)."));
      else fail(new Error(lastProblem || `closed (${ev.code})`));
    };
  });
}

/**
 * Fetch candles from `untilSec` up to `fromSec` (newest first, page by page).
 * Calls onPage with each page's candles; resolves with the total.
 */
export function fetchHistory(conn: PoConnection, asset: string, fromSec: number, untilSec: number, onPage: (c: Candle[]) => Promise<void> | void, pageTimeoutMs = 15_000, maxPages = 400): Promise<{ loaded: number; pages: number; oldest: number | null }> {
  const pager = new HistoryPager(asset, fromSec, untilSec, maxPages);
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let busy = false;
    const finish = (err?: Error) => {
      if (timer) clearTimeout(timer);
      off();
      if (err) reject(err);
      else resolve({ loaded: pager.loaded, pages: pager.pages, oldest: pager.oldest });
    };
    const ask = () => {
      if (!conn.open) return finish(new Error("Lost the connection to PocketOption."));
      conn.send(pager.next());
      timer = setTimeout(() => finish(new Error("PocketOption stopped answering.")), pageTimeoutMs);
    };
    const off = conn.on(async (e) => {
      if (e.type !== "po_candles" || e.index !== pager.index || busy) return;
      busy = true;
      if (timer) clearTimeout(timer);
      try {
        await onPage(pager.take(e.candles));
      } catch (err) {
        return finish(err as Error);
      } finally {
        busy = false;
      }
      if (pager.done) finish();
      else timer = setTimeout(ask, 100);
    });
    ask();
  });
}
