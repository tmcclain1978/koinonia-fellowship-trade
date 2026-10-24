/**
 * One PocketOption connection for the whole app (like the Schwab feed).
 *
 * The Connection tab and the Pattern Engine used to open separate
 * connections; switching tabs closed the one you had just connected, and the
 * other never received prices. Now every screen shares this client, and it
 * stays connected while you move around.
 */
export type PoState = "disconnected" | "connecting" | "connected" | "authenticated" | "error";

export interface PoTick { asset: string; time: number; price: number }
export interface PoCandle { time: number; open: number; high: number; low: number; close: number; volume?: number }
export interface PoDeal { id: string; asset: string; amount: number; profit: number; result: "win" | "loss" | "draw" }

export interface PoAssetInfo { asset: string; name: string; kind: string; payout: number; otc: boolean; active: boolean }

/** A "load older candles" job. */
export interface PoBackfill { asset: string; running: boolean; loaded: number; progress: number; error?: string }

export interface PoSnapshot {
  state: PoState;
  endpoint?: string;
  attempt?: number;
  totalAttempts?: number;
  errorMessage?: string;
  errorCode?: string;
  /** From the saved SSID: 1 = demo, 0 = real money. */
  isDemo: 0 | 1 | null;
  balance: number | null;
  /** Latest price per asset (exact PocketOption name, e.g. EURUSD_otc). */
  prices: Record<string, number>;
  /** Candles received from PocketOption's history, per asset. */
  history: Record<string, PoCandle[]>;
  deals: PoDeal[];
  lastTickAt: number | null;
  /** PocketOption's asset list with payouts (arrives after login). */
  assets: PoAssetInfo[];
  backfill: PoBackfill | null;
}

export interface WsLike {
  readyState: number;
  protocol?: string;
  send(d: string): void;
  close(): void;
  onopen: ((e: unknown) => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onclose: ((e: { code?: number }) => void) | null;
}

export interface PoClientDeps {
  url: string;
  getToken: () => Promise<string | null>;
  createSocket: (url: string, protocols: string[]) => WsLike;
  notify?: (kind: "success" | "error" | "info", title: string, description?: string) => void;
  setTimeout?: (f: () => void, ms: number) => unknown;
  clearTimeout?: (id: unknown) => void;
}

const BACKOFF = [2000, 4000, 8000, 16000, 30000];
const MAX_HISTORY = 500;

export class PoClient {
  private s: PoSnapshot = { state: "disconnected", isDemo: null, balance: null, prices: {}, history: {}, deals: [], lastTickAt: null, assets: [], backfill: null };
  private listeners = new Set<() => void>();
  private tickListeners = new Set<(t: PoTick) => void>();
  private pageListeners = new Set<(asset: string, candles: PoCandle[]) => void>();
  private latestWaiters = new Map<string, Array<(r: { candles: PoCandle[]; error?: string }) => void>>();
  private historyWaiters: Array<(r: PoBackfill) => void> = [];
  private ws: WsLike | null = null;
  private wanted = false;
  private attempts = 0;
  private retryTimer: unknown = null;
  private keepAlive: unknown = null;
  private watching: { asset: string; period: number } | null = null;
  private deps: Required<Omit<PoClientDeps, "notify">> & Pick<PoClientDeps, "notify">;

  constructor(deps: PoClientDeps) {
    this.deps = { setTimeout: (f, ms) => globalThis.setTimeout(f, ms), clearTimeout: (id) => globalThis.clearTimeout(id as number), ...deps };
  }

  /* ---- store ---- */
  getSnapshot = () => this.s;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  /** Every live price as it arrives (for building candles). */
  onTick(l: (t: PoTick) => void) {
    this.tickListeners.add(l);
    return () => {
      this.tickListeners.delete(l);
    };
  }
  /** Older candles from a loadHistory() job, page by page. */
  onHistoryPage(l: (asset: string, candles: PoCandle[]) => void) {
    this.pageListeners.add(l);
    return () => {
      this.pageListeners.delete(l);
    };
  }
  private set(p: Partial<PoSnapshot>) {
    this.s = { ...this.s, ...p };
    this.listeners.forEach((l) => l());
  }

  get ready() {
    return this.s.state === "authenticated";
  }

  /* ---- actions ---- */
  async connect() {
    this.wanted = true;
    this.attempts = 0;
    if (this.ws && this.ws.readyState <= 1) {
      // Already talking to the bridge (e.g. after "couldn't reach PocketOption"): ask it to try again.
      if (this.s.state === "error" && this.ws.readyState === 1) {
        this.set({ state: "connecting", errorMessage: undefined, errorCode: undefined });
        this.sendJson({ type: "connect" });
      }
      return;
    }
    await this.open();
  }

  disconnect() {
    this.wanted = false;
    if (this.retryTimer) this.deps.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.closeSocket();
    this.set({ state: "disconnected", errorMessage: undefined, errorCode: undefined });
  }

  /** Watch an asset: PocketOption sends its recent candles, then live prices. */
  watch(asset: string, period = 60) {
    this.watching = { asset, period };
    this.sendJson({ type: "subscribe_candles", asset, period });
  }

  /** Fetch older candles (PocketOption keeps about 90 days). Pages arrive via onHistoryPage. */
  loadHistory(asset: string, days: number, sinceMs?: number): boolean {
    if (!this.ready) return false;
    const ok = this.sendJson({ type: "load_history", asset, days, ...(sinceMs ? { sinceMs } : {}) });
    if (ok) this.set({ backfill: { asset, running: true, loaded: 0, progress: 0 } });
    return ok;
  }

  /** The last ~150 finished 1-minute candles of any asset (doesn't change the watched one). */
  fetchLatest(asset: string, timeoutMs = 12_000): Promise<{ candles: PoCandle[]; error?: string }> {
    if (!this.ready || !this.sendJson({ type: "latest", asset })) return Promise.resolve({ candles: [], error: "Not connected" });
    return new Promise((resolve) => {
      const list = this.latestWaiters.get(asset) ?? [];
      let done = false;
      const finish = (r: { candles: PoCandle[]; error?: string }) => {
        if (done) return;
        done = true;
        resolve(r);
      };
      list.push(finish);
      this.latestWaiters.set(asset, list);
      this.deps.setTimeout(() => {
        const l = this.latestWaiters.get(asset);
        if (l) this.latestWaiters.set(asset, l.filter((f) => f !== finish));
        finish({ candles: [], error: "No answer" });
      }, timeoutMs);
    });
  }

  /** loadHistory() and wait until it finishes (pages still arrive via onHistoryPage). */
  loadHistoryAndWait(asset: string, days: number, sinceMs?: number): Promise<PoBackfill> {
    if (!this.loadHistory(asset, days, sinceMs)) return Promise.resolve({ asset, running: false, loaded: 0, progress: 0, error: "Not connected" });
    return new Promise((resolve) => this.historyWaiters.push(resolve));
  }

  stopHistory() {
    this.sendJson({ type: "stop_history" });
  }

  trade(t: { asset: string; action: "call" | "put"; amount: number; duration: number }): boolean {
    if (!this.ready) {
      this.deps.notify?.("error", "Not ready", this.s.state === "connected" ? "Still logging in to PocketOption…" : "Connect to PocketOption first.");
      return false;
    }
    return this.sendJson({ type: "trade", ...t });
  }

  /* ---- internals ---- */
  private sendJson(o: unknown) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(o));
      return true;
    }
    return false;
  }

  /** Anyone waiting on an answer gets "no" when the connection drops. */
  private failPending(error: string) {
    const h = this.historyWaiters;
    this.historyWaiters = [];
    h.forEach((w) => w({ asset: "", running: false, loaded: 0, progress: 0, error }));
    const l = this.latestWaiters;
    this.latestWaiters = new Map();
    for (const list of l.values()) list.forEach((f) => f({ candles: [], error }));
  }

  private closeSocket() {
    this.failPending("Disconnected");
    if (this.keepAlive) this.deps.clearTimeout(this.keepAlive);
    this.keepAlive = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      try { ws.close(); } catch { /* ignore */ }
    }
  }

  private async open() {
    const token = await this.deps.getToken().catch(() => null);
    if (!token) {
      this.set({ state: "error", errorMessage: "Sign in to connect to PocketOption." });
      return;
    }
    this.set({ state: "connecting", errorMessage: undefined, errorCode: undefined, attempt: undefined, totalAttempts: undefined });
    let ws: WsLike;
    try {
      // Sign-in goes in the address, the way Supabase documents for browser
      // WebSockets (a subprotocol can be dropped on the way).
      const sep = this.deps.url.includes("?") ? "&" : "?";
      ws = this.deps.createSocket(`${this.deps.url}${sep}token=${encodeURIComponent(token)}`, []);
    } catch (e) {
      this.set({ state: "error", errorMessage: (e as Error).message });
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "connect" }));
      const ping = () => {
        this.sendJson({ type: "ping" });
        this.keepAlive = this.deps.setTimeout(ping, 30_000);
      };
      this.keepAlive = this.deps.setTimeout(ping, 30_000);
    };
    ws.onmessage = (ev) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bridge messages, checked field by field
      let m: Record<string, any>;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.handle(m);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.failPending("Lost the connection");
      if (this.keepAlive) this.deps.clearTimeout(this.keepAlive);
      // Problems a retry can't fix: show them and wait for the user.
      const stopped = ["AUTH_FAILED", "LOGIN_REJECTED", "BAD_SSID", "NO_SSID", "NOT_SIGNED_IN", "NO_ENDPOINT"].includes(this.s.errorCode ?? "");
      if (!stopped) this.set({ state: "disconnected" });
      if (!this.wanted || stopped) return;
      if (this.attempts >= BACKOFF.length) {
        this.set({ state: "error", errorMessage: "Lost the connection to PocketOption. Press Connect to try again." });
        return;
      }
      const delay = BACKOFF[this.attempts++];
      this.retryTimer = this.deps.setTimeout(() => {
        this.retryTimer = null;
        if (this.wanted) void this.open();
      }, delay);
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bridge messages, checked field by field
  private handle(m: Record<string, any>) {
    switch (m.type) {
      case "authenticated":
        if (m.isDemo === 0 || m.isDemo === 1) this.set({ isDemo: m.isDemo });
        return;
      case "connection_attempt":
        this.set({ state: "connecting", endpoint: m.endpoint, attempt: m.attemptNumber, totalAttempts: m.totalEndpoints });
        return;
      case "connection":
        if (m.status === "connected") this.set({ state: "connected", endpoint: m.endpoint });
        return;
      case "po_authenticated":
        this.attempts = 0;
        this.set({ state: "authenticated", isDemo: m.isDemo, endpoint: m.endpoint ?? this.s.endpoint });
        this.deps.notify?.("success", "Logged in to PocketOption", m.isDemo ? "Demo account" : "REAL money account");
        if (this.watching) this.sendJson({ type: "subscribe_candles", ...this.watching });
        return;
      case "po_balance":
        if (typeof m.balance === "number") this.set({ balance: m.balance });
        return;
      case "po_ticks": {
        const ticks: PoTick[] = Array.isArray(m.ticks) ? m.ticks : [];
        if (!ticks.length) return;
        const prices = { ...this.s.prices };
        for (const t of ticks) {
          prices[t.asset] = t.price;
          this.tickListeners.forEach((l) => l(t));
        }
        this.set({ prices, lastTickAt: Date.now() });
        return;
      }
      case "po_candles": {
        const existing = this.s.history[m.asset] ?? [];
        const byTime = new Map<number, PoCandle>(existing.map((c) => [c.time, c]));
        for (const c of m.candles ?? []) byTime.set(c.time, c);
        const merged = Array.from(byTime.values()).sort((a, b) => a.time - b.time).slice(-MAX_HISTORY);
        this.set({ history: { ...this.s.history, [m.asset]: merged } });
        return;
      }
      case "po_assets":
        if (Array.isArray(m.assets)) this.set({ assets: m.assets });
        return;
      case "po_history_page": {
        const candles: PoCandle[] = Array.isArray(m.candles) ? m.candles : [];
        if (candles.length) this.pageListeners.forEach((l) => l(m.asset, candles));
        this.set({ backfill: { asset: m.asset, running: true, loaded: m.loaded ?? 0, progress: m.progress ?? 0 } });
        return;
      }
      case "po_history_done": {
        const b: PoBackfill = { asset: m.asset, running: false, loaded: m.loaded ?? 0, progress: m.error ? (m.progress ?? 0) : 1, ...(m.error ? { error: m.error } : {}) };
        this.set({ backfill: b });
        const waiters = this.historyWaiters;
        this.historyWaiters = [];
        waiters.forEach((w) => w(b));
        return;
      }
      case "po_latest": {
        const list = this.latestWaiters.get(m.asset);
        const first = list?.shift();
        first?.({ candles: Array.isArray(m.candles) ? m.candles : [], ...(m.error ? { error: m.error } : {}) });
        return;
      }
      case "trade_sent":
        this.deps.notify?.("info", "Trade sent", `${String(m.action).toUpperCase()} ${m.asset} $${m.amount} (${m.isDemo ? "demo" : "REAL money"})`);
        return;
      case "po_order_failed":
        this.deps.notify?.("error", "Trade not placed", m.reason);
        return;
      case "po_deals_closed": {
        const deals: PoDeal[] = Array.isArray(m.deals) ? m.deals : [];
        this.set({ deals: [...deals, ...this.s.deals].slice(0, 100) });
        for (const d of deals) {
          if (d.result === "win") this.deps.notify?.("success", "Trade won", `${d.asset}: +$${d.profit.toFixed(2)}`);
          else if (d.result === "loss") this.deps.notify?.("error", "Trade lost", `${d.asset}: −$${Math.abs(d.profit).toFixed(2)}`);
          else this.deps.notify?.("info", "Trade tied", d.asset);
        }
        return;
      }
      case "error":
        this.set({ state: "error", errorMessage: m.message, errorCode: m.code });
        this.deps.notify?.("error", m.code === "AUTH_FAILED" || m.code === "LOGIN_REJECTED" ? "PocketOption login failed" : "PocketOption", m.message);
        return;
    }
  }
}

/* ---------------------------------------------------------------------------
 * Asset names
 * ------------------------------------------------------------------------ */

/**
 * Regular forex trades Sunday 22:00 UTC to Friday 22:00 UTC; outside that
 * PocketOption only offers its OTC version (EURUSD_otc).
 */
export function forexOpen(now: Date): boolean {
  const day = now.getUTCDay();
  const h = now.getUTCHours();
  if (day === 6) return false;
  if (day === 0) return h >= 22;
  if (day === 5) return h < 22;
  return true;
}

/** "EUR/USD" -> "EURUSD" when forex is open, else "EURUSD_otc". `otc` forces one or the other. */
export function poAsset(pair: string, now = new Date(), otc?: boolean): string {
  const base = pair.replace("/", "").toUpperCase();
  return (otc ?? !forexOpen(now)) ? `${base}_otc` : base;
}
