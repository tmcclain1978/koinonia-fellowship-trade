/**
 * PocketOption socket.io (Engine.IO v4) protocol, as a small state machine
 * that the bridge feeds raw frames into. Pure and unit-tested; no network.
 *
 * Connection flow (what the server actually sends):
 *   server: 0{"sid":...,"pingInterval":...}   -> we send "40"
 *   server: 40{"sid":...}                       -> we send the auth message
 *   server: 451-["successauth",{"_placeholder":true,"num":0}] + binary frame
 *   server: "2" (ping)                          -> we send "3"
 * Most data (balance, price stream, history, deals) arrives the same way:
 * a "451-[event, placeholder]" text frame, then a binary frame with the JSON.
 * Plain "42[event, data]" frames are handled too.
 */

export interface AuthInfo {
  /** The exact auth frame to send: 42["auth",{...}] */
  message: string;
  isDemo: 0 | 1;
  uid: string;
}

/**
 * The SSID from the browser (DevTools > Network > WS) is normally the whole
 * 42["auth",{...}] frame; we send it as-is. Other shapes are converted.
 */
export function parseSsid(raw: string): AuthInfo | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  try {
    let obj: Record<string, unknown> | null = null;
    if (s.startsWith("42[")) {
      const arr = JSON.parse(s.slice(2));
      if (Array.isArray(arr) && arr[0] === "auth" && arr[1] && typeof arr[1] === "object") {
        obj = arr[1] as Record<string, unknown>;
        const isDemo = obj.isDemo === 1 || obj.isDemo === true || obj.isDemo === "1" ? 1 : 0;
        return { message: s, isDemo, uid: String(obj.uid ?? obj.id ?? "") };
      }
      if (Array.isArray(arr) && arr[0] === "user_init" && arr[1]) obj = arr[1] as Record<string, unknown>;
    } else if (s.startsWith("{")) obj = JSON.parse(s);
    if (obj) {
      const session = String(obj.session ?? obj.secret ?? "");
      if (!session) return null;
      const isDemo = obj.isDemo === 1 || obj.isDemo === true || obj.isDemo === "1" ? 1 : 0;
      const uid = String(obj.uid ?? obj.id ?? "");
      const payload = { session, isDemo, uid: Number(uid) || uid, platform: Number(obj.platform) || 2 };
      return { message: `42["auth",${JSON.stringify(payload)}]`, isDemo, uid };
    }
  } catch {
    return null;
  }
  // A bare session token can't be used: PocketOption also needs the user id
  // and account type, which are only in the full auth message.
  return null;
}

/** Demo accounts connect to demo servers first; real accounts to real servers. */
export const REAL_ENDPOINTS = [
  "api-eu.po.market", "api-l.po.market", "api-c.po.market", "api-fin.po.market", "api-fr.po.market",
  "api-us-north.po.market", "api-us-south.po.market", "api-us2.po.market", "api-us3.po.market", "api-us4.po.market",
  "api-asia.po.market", "api-hk.po.market", "api-in.po.market", "api-sc.po.market", "api-msk.po.market", "api-spb.po.market",
];
export const DEMO_ENDPOINTS = ["demo-api-eu.po.market", "try-demo-eu.po.market"];
export const endpointUrl = (host: string) => `wss://${host}/socket.io/?EIO=4&transport=websocket`;
export const endpointsFor = (isDemo: 0 | 1) => (isDemo ? [...DEMO_ENDPOINTS, ...REAL_ENDPOINTS] : REAL_ENDPOINTS);

export const PO_HEADERS = {
  Origin: "https://pocketoption.com",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

/* ---------------------------------------------------------------------------
 * Normalized messages sent on to the browser
 * ------------------------------------------------------------------------ */

export interface Tick { asset: string; time: number; price: number }
export interface Candle { time: number; open: number; high: number; low: number; close: number; volume?: number }

export type PoEvent =
  | { type: "po_connected" } // socket.io namespace joined, auth sent
  | { type: "po_authenticated"; isDemo: 0 | 1 }
  | { type: "po_auth_failed"; reason: string }
  | { type: "po_balance"; balance: number; isDemo: 0 | 1 | null }
  | { type: "po_ticks"; ticks: Tick[] }
  | { type: "po_candles"; asset: string; period: number; candles: Candle[]; index?: number }
  | { type: "po_assets"; assets: PoAsset[] }
  | { type: "po_order_opened"; order: Record<string, unknown> }
  | { type: "po_order_failed"; reason: string; data: unknown }
  | { type: "po_deals_closed"; deals: Array<{ id: string; asset: string; amount: number; profit: number; result: "win" | "loss" | "draw" }> }
  | { type: "po_other"; event: string; data: unknown };

/** One tradable asset from PocketOption's list. */
export interface PoAsset {
  asset: string;
  name: string;
  /** currency, stock, commodity, index, cryptocurrency */
  kind: string;
  /** Base payout in percent (your account may get a few points more). */
  payout: number;
  otc: boolean;
  /** Open for trading right now. */
  active: boolean;
}

/**
 * updateAssets: one array per asset. Positions (checked against the live
 * site, Oct 2026): 1 symbol, 2 name, 3 kind, 5 payout %, 9 OTC flag, 14 open.
 */
export function parseAssets(data: unknown): PoAsset[] {
  if (!Array.isArray(data)) return [];
  const out: PoAsset[] = [];
  for (const r of data) {
    if (!Array.isArray(r) || typeof r[1] !== "string") continue;
    const payout = num(r[5]);
    out.push({ asset: r[1], name: String(r[2] ?? r[1]), kind: String(r[3] ?? ""), payout: Number.isFinite(payout) ? payout : 0, otc: r[9] === 1 || r[9] === true, active: r[14] === true || r[14] === 1 });
  }
  return out;
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN);
/** PocketOption times are seconds (with decimals); we use ms. */
const ms = (t: number) => (t < 1e12 ? Math.round(t * 1000) : Math.round(t));

export function parseTicks(data: unknown): Tick[] {
  const out: Tick[] = [];
  const items = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  for (const it of items) {
    if (Array.isArray(it) && typeof it[0] === "string") {
      // ["EURUSD_otc", 1712345678.123, 1.08123]
      const t = num(it[1]), p = num(it[2]);
      if (Number.isFinite(t) && p > 0) out.push({ asset: it[0], time: ms(t), price: p });
    } else if (it && typeof it === "object") {
      const o = it as Record<string, unknown>;
      const asset = String(o.asset ?? o.symbol ?? "");
      const t = num(o.time ?? o.timestamp);
      const p = num(o.price ?? o.value ?? o.close);
      if (asset && Number.isFinite(t) && p > 0) out.push({ asset, time: ms(t), price: p });
    }
  }
  return out;
}

/** History: list items [t, open, close, high, low, volume?] (server order) or {time, open, high, low, close}. */
export function parseCandles(list: unknown): Candle[] {
  if (!Array.isArray(list)) return [];
  const out: Candle[] = [];
  for (const c of list) {
    let k: Candle | null = null;
    if (Array.isArray(c) && c.length >= 5) k = { time: ms(num(c[0])), open: num(c[1]), close: num(c[2]), high: num(c[3]), low: num(c[4]), ...(c.length > 5 ? { volume: num(c[5]) } : {}) };
    else if (c && typeof c === "object") {
      const o = c as Record<string, unknown>;
      k = { time: ms(num(o.time ?? o.timestamp)), open: num(o.open), high: num(o.high ?? o.max), low: num(o.low ?? o.min), close: num(o.close), ...(o.volume !== undefined ? { volume: num(o.volume) } : {}) };
    }
    if (k && [k.time, k.open, k.high, k.low, k.close].every(Number.isFinite) && k.high >= k.low && k.close > 0) out.push(k);
  }
  return out.sort((a, b) => a.time - b.time);
}

function parseDeals(data: unknown) {
  const list = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { deals?: unknown }).deals) ? (data as { deals: unknown[] }).deals : data && typeof data === "object" ? [data] : [];
  return list
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .filter((d) => d.profit !== undefined)
    .map((d) => {
      const profit = num(d.profit);
      return { id: String(d.id ?? d.requestId ?? ""), asset: String(d.asset ?? ""), amount: num(d.amount), profit, result: (profit > 0 ? "win" : profit < 0 ? "loss" : "draw") as "win" | "loss" | "draw" };
    })
    .filter((d) => Number.isFinite(d.profit));
}

/** Turn one decoded socket.io event into normalized messages. */
export function interpretEvent(event: string, data: unknown, auth: AuthInfo): PoEvent[] {
  const d = data as Record<string, unknown> | null;
  switch (event) {
    case "successauth":
      return [{ type: "po_authenticated", isDemo: auth.isDemo }];
    case "failauth":
    case "authFail":
    case "NotAuthorized":
      return [{ type: "po_auth_failed", reason: typeof data === "string" ? data : "PocketOption rejected the login (the SSID may be expired)." }];
    case "successupdateBalance":
    case "balance":
    case "updateBalance": {
      const b = num(d?.balance ?? data);
      return Number.isFinite(b) ? [{ type: "po_balance", balance: b, isDemo: d?.isDemo === 1 || d?.isDemo === true ? 1 : d?.isDemo === 0 || d?.isDemo === false ? 0 : null }] : [];
    }
    case "updateStream": {
      const ticks = parseTicks(data);
      return ticks.length ? [{ type: "po_ticks", ticks }] : [{ type: "po_other", event, data }];
    }
    case "successopenOrder":
    case "openOrder":
      return [{ type: "po_order_opened", order: (d ?? {}) as Record<string, unknown> }];
    case "failopenOrder":
      return [{ type: "po_order_failed", reason: String((d?.error ?? d?.message ?? data) || "Order rejected"), data }];
    case "updateAssets": {
      const assets = parseAssets(data);
      return assets.length ? [{ type: "po_assets", assets }] : [{ type: "po_other", event, data }];
    }
    case "successcloseOrder":
    case "updateClosedDeals":
    case "deals": {
      const deals = parseDeals(d && typeof d === "object" && "deals" in d ? d.deals : data);
      return deals.length ? [{ type: "po_deals_closed", deals }] : [{ type: "po_other", event, data }];
    }
  }
  // History arrives under a few names (updateHistoryNewFast, loadHistoryPeriod, ...): recognize it by shape.
  if (d && typeof d === "object" && !Array.isArray(d) && typeof d.asset === "string" && (Array.isArray(d.candles) || Array.isArray(d.data))) {
    const candles = parseCandles(Array.isArray(d.candles) ? d.candles : d.data);
    const index = num(d.index);
    // An empty page still answers a history request (the pager needs to know).
    if (candles.length || Number.isFinite(index)) return [{ type: "po_candles", asset: d.asset, period: num(d.period) || 60, candles, ...(Number.isFinite(index) ? { index } : {}) }];
  }
  return [{ type: "po_other", event, data }];
}

/** Guess the event of a binary frame that arrived without a placeholder. */
function guessEvent(data: unknown): string {
  if (Array.isArray(data) && Array.isArray(data[0]) && typeof data[0][0] === "string") return "updateStream";
  if (data && typeof data === "object" && "balance" in (data as object)) return "successupdateBalance";
  if (data && typeof data === "object" && "deals" in (data as object)) return "updateClosedDeals";
  return "binary";
}

/**
 * Socket.io session: feed it every frame from PocketOption; it replies
 * through `send` and reports normalized events through `emit`.
 */
export class PoSession {
  connected = false;
  authenticated = false;
  private pendingBinary: string[] = [];
  private decoder = new TextDecoder();

  constructor(private auth: AuthInfo, private send: (frame: string) => void, private emit: (e: PoEvent) => void, private log: (...a: unknown[]) => void = () => {}) {}

  handle(frame: string | ArrayBuffer | Uint8Array): void {
    if (typeof frame !== "string") {
      const bytes = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
      // Engine.IO v4 may prefix binary with a 0x04 byte.
      const text = this.decoder.decode(bytes[0] === 4 ? bytes.subarray(1) : bytes);
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        this.log("binary frame is not JSON");
        return;
      }
      const event = this.pendingBinary.shift() ?? guessEvent(data);
      this.dispatch(event, data);
      return;
    }
    if (frame === "2") {
      this.send("3");
      return;
    }
    if (frame === "3") return;
    if (frame.startsWith("0{")) {
      // Engine.IO open: join the default namespace.
      this.send("40");
      return;
    }
    if (frame.startsWith("40")) {
      // Namespace joined (server sends 40{"sid":...}): log in.
      if (!this.connected) {
        this.connected = true;
        this.send(this.auth.message);
        this.emit({ type: "po_connected" });
      }
      return;
    }
    if (frame.startsWith("41")) {
      this.connected = false;
      this.authenticated = false;
      return;
    }
    if (frame.startsWith("44")) {
      this.emit({ type: "po_auth_failed", reason: `PocketOption refused the connection: ${frame.slice(2, 200)}` });
      return;
    }
    // Binary event header: 45<n>-["event",{"_placeholder":true,"num":0}]
    const bin = frame.match(/^45(\d+)-(.*)$/s);
    if (bin) {
      try {
        const arr = JSON.parse(bin[2]);
        if (Array.isArray(arr) && typeof arr[0] === "string") {
          for (let i = 0; i < Number(bin[1]); i++) this.pendingBinary.push(arr[0]);
        }
      } catch {
        this.log("bad binary header", frame.slice(0, 80));
      }
      return;
    }
    if (frame.startsWith("42")) {
      try {
        const arr = JSON.parse(frame.slice(2));
        if (Array.isArray(arr) && typeof arr[0] === "string") this.dispatch(arr[0], arr[1]);
      } catch {
        this.log("bad event frame", frame.slice(0, 80));
      }
    }
  }

  private dispatch(event: string, data: unknown) {
    for (const e of interpretEvent(event, data, this.auth)) {
      if (e.type === "po_authenticated") this.authenticated = true;
      this.emit(e);
    }
  }
}

/* ---------------------------------------------------------------------------
 * Requests to PocketOption
 * ------------------------------------------------------------------------ */

/** Watch an asset: live price stream + recent candles for this period. */
export const changeSymbolFrame = (asset: string, periodSec = 60) => `42["changeSymbol",${JSON.stringify({ asset, period: periodSec })}]`;

export function openOrderFrame(o: { asset: string; amount: number; action: "call" | "put"; timeSec: number; isDemo: 0 | 1; requestId: string }) {
  return `42["openOrder",${JSON.stringify({ asset: o.asset, amount: o.amount, action: o.action, isDemo: o.isDemo, requestId: o.requestId, optionType: 100, time: o.timeSec })}]`;
}

/** PocketOption sends at most this much history per request (150 one-minute candles). */
export const HISTORY_PAGE_SEC = 9000;

/** Ask for the candles in the HISTORY_PAGE_SEC before `timeSec` (seconds). `index` tags the reply. */
export const historyFrame = (asset: string, timeSec: number, index: number, periodSec = 60) =>
  `42["loadHistoryPeriod",${JSON.stringify({ asset, index, time: Math.floor(timeSec), offset: HISTORY_PAGE_SEC, period: periodSec })}]`;

/**
 * Walks back through history one page at a time: from `fromSec` (newest)
 * down to `untilSec` (oldest wanted). next() gives the frame to send;
 * take() feeds a reply and says whether to keep going.
 */
export class HistoryPager {
  private cursor: number;
  private seq = 0;
  index = 0;
  loaded = 0;
  pages = 0;
  oldest: number | null = null;
  private emptyRun = 0;

  constructor(readonly asset: string, fromSec: number, readonly untilSec: number, readonly maxPages = 400, readonly periodSec = 60) {
    this.cursor = Math.floor(fromSec);
  }

  get done(): boolean {
    return this.cursor <= this.untilSec || this.pages >= this.maxPages || this.emptyRun >= 3;
  }

  /** Share of the way back, 0..1. */
  progress(fromSec: number): number {
    const span = fromSec - this.untilSec;
    return span > 0 ? Math.min(1, Math.max(0, (fromSec - this.cursor) / span)) : 1;
  }

  next(): string {
    this.index = this.cursor * 100 + (++this.seq % 100);
    return historyFrame(this.asset, this.cursor, this.index, this.periodSec);
  }

  /** A reply for our request: returns the candles in range. */
  take(candles: Candle[]): Candle[] {
    this.pages++;
    const inRange = candles.filter((c) => c.time / 1000 >= this.untilSec && c.time / 1000 < this.cursor);
    if (!candles.length) this.emptyRun++;
    else this.emptyRun = 0;
    const first = candles.length ? Math.floor(candles[0].time / 1000) : this.cursor - HISTORY_PAGE_SEC;
    // Move to the start of what we got (never forward), so pages don't overlap or leave gaps.
    this.cursor = Math.min(this.cursor - 60, first);
    this.loaded += inRange.length;
    if (inRange.length) this.oldest = Math.min(this.oldest ?? Infinity, inRange[0].time);
    return inRange;
  }
}

/** Validate a trade request from the browser. */
export function validateTrade(m: Record<string, unknown>): { ok: true; asset: string; amount: number; action: "call" | "put"; timeSec: number } | { ok: false; reason: string } {
  const asset = String(m.asset ?? "");
  const amount = num(m.amount);
  const timeSec = Math.round(num(m.duration ?? m.time ?? 60));
  if (!/^#?[A-Za-z0-9_.]{2,24}$/.test(asset)) return { ok: false, reason: "Unknown asset" };
  if (!(amount >= 1 && amount <= 10_000)) return { ok: false, reason: "Amount must be between $1 and $10,000" };
  if (m.action !== "call" && m.action !== "put") return { ok: false, reason: "Direction must be call or put" };
  if (!(timeSec >= 5 && timeSec <= 14_400)) return { ok: false, reason: "Expiry must be 5 seconds to 4 hours" };
  return { ok: true, asset, amount, action: m.action, timeSec };
}
