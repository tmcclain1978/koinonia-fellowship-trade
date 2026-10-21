/**
 * One shared Schwab market-data feed per browser tab.
 *
 * Why this exists:
 *  - Schwab allows only one streamer connection at a time. Every chart, quote
 *    list and Time & Sales panel used to open its own WebSocket, so they
 *    logged each other out.
 *  - LEVELONE_EQUITIES sends only the fields that changed. The old code read
 *    missing fields as 0 (volume reset to 0, high/low jumped) and used the
 *    wrong field numbers (bid was read as the last price, exchange ID as the
 *    low, trade size as the net change).
 *
 * The feed keeps one connection, subscribes to the union of every
 * component's symbols, merges partial updates into a full quote, and falls
 * back to one shared REST poll when streaming isn't available.
 */
import type { SchwabQuote } from "@/lib/schwabApi";
import { mergeBooks, parseBookItem, SERVICE_VENUE, type BookSnapshot, type BookVenue, type VenueBook } from "./book";

/* ----------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

export interface StreamingQuote extends SchwabQuote {
  lastUpdated: Date;
  previousPrice?: number;
  priceDirection?: "up" | "down" | "unchanged";
  /** True for real-time Schwab data (stream or REST), false for fallbacks. */
  isLive: boolean;
  /** This update came from the live stream (not a REST refresh). */
  viaStream?: boolean;
}

export type FeedStatus = "idle" | "connecting" | "streaming" | "polling" | "error";

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
}

export interface FeedDeps {
  createSocket: (url: string, protocols: string[]) => WebSocketLike;
  /** Supabase access token, or null when signed out. */
  getAccessToken: () => Promise<string | null>;
  fetchQuotes: (symbols: string[]) => Promise<SchwabQuote[]>;
  streamUrl: string;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (id: unknown) => void;
  log?: (...args: unknown[]) => void;
}

export interface QuoteSubscription {
  symbols: string[];
  onQuote: (quote: StreamingQuote) => void;
  /** Requested polling interval when streaming is unavailable. */
  pollMs?: number;
  /** Whether this subscriber wants the WebSocket (false = polling only). */
  useWebSocket?: boolean;
}

/** Messages from the schwab-streaming edge function. */
interface StreamMessage {
  type?: "connected" | "data" | "disconnected" | "error" | string;
  service?: string;
  content?: Array<Record<string, unknown>>;
  message?: string;
  code?: number;
}

/**
 * Level 2 availability for a subscriber:
 *  - "waiting": asked for, no book yet (connecting, or a quiet symbol)
 *  - "live": receiving books
 *  - "needs-stream": the live stream isn't connected (Level 2 can't be polled)
 *  - "unavailable": Schwab refused the book (e.g. account not entitled)
 */
export type BookStatus = "waiting" | "live" | "needs-stream" | "unavailable";

export interface BookSubscription {
  symbol: string;
  onBook: (book: BookSnapshot) => void;
  onStatus?: (status: BookStatus, message?: string) => void;
}

/** Level 2 is heavy; charts rarely need more than a few at once. */
export const MAX_BOOK_SYMBOLS = 5;

export interface AccountActivityItem {
  accountNumber: string;
  messageType: string;
  messageData: unknown;
  timestamp: Date;
}

/* ----------------------------------------------------------------------------
 * LEVELONE_EQUITIES field map (Schwab Trader API streamer)
 * ------------------------------------------------------------------------- */

export const L1 = {
  SYMBOL: "0",
  BID: "1",
  ASK: "2",
  LAST: "3",
  BID_SIZE: "4",
  ASK_SIZE: "5",
  TOTAL_VOLUME: "8",
  LAST_SIZE: "9",
  HIGH: "10",
  LOW: "11",
  CLOSE: "12",
  OPEN: "17",
  NET_CHANGE: "18",
  MARK: "33",
  QUOTE_TIME: "34",
  TRADE_TIME: "35",
  NET_CHANGE_PERCENT: "42",
} as const;

export const LEVEL_ONE_FIELDS = Object.values(L1).join(",");

const STREAMING_SERVICE = "LEVELONE_EQUITIES";
const MIN_POLL_MS = 2_000;
const DEFAULT_POLL_MS = 15_000;
/** If streaming but no data for this long, refresh once via REST. */
const STREAM_WATCHDOG_MS = 30_000;
/** Close the socket this long after the last subscriber leaves (avoids churn on remount). */
const IDLE_CLOSE_MS = 5_000;
const BACKOFF_STEPS_MS = [2_000, 5_000, 10_000, 20_000, 40_000, 60_000];
/** After this many failed connects in a row, poll for a while before trying again. */
const MAX_CONNECT_FAILURES = BACKOFF_STEPS_MS.length;
const COOL_OFF_MS = 5 * 60_000;
/** How long a live quote is preferred over a fallback quote for the same symbol. */
const LIVE_QUOTE_GRACE_MS = 5 * 60_000;
/** Retry interval while signed out (picks up a later sign-in). */
const SIGNED_OUT_RETRY_MS = 60_000;

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

/** A quote counts as live only when it came from Schwab (no fallback source label). */
export const isLiveSource = (q: Pick<SchwabQuote, "source" | "isPreviousClose">): boolean =>
  !q.isPreviousClose && (!q.source || q.source === "schwab" || q.source === "schwab-cached");

/**
 * Merge one LEVELONE_EQUITIES update into the previous quote. Fields that are
 * absent in the update keep their previous value (Schwab sends only changes).
 */
export function mergeLevelOne(prev: StreamingQuote | undefined, item: Record<string, unknown>, now: number): StreamingQuote | null {
  const symbol = String(item.key ?? item[L1.SYMBOL] ?? prev?.symbol ?? "").toUpperCase();
  if (!symbol) return null;
  const pick = (field: string, prevValue: number | undefined) => num(item[field]) ?? prevValue;

  const lastPrice = pick(L1.LAST, prev?.lastPrice);
  if (lastPrice === undefined) return null; // nothing usable yet (e.g. bid-only update for a new symbol)

  const closePrice = pick(L1.CLOSE, prev?.closePrice);
  let netChange = num(item[L1.NET_CHANGE]);
  let netPercentChange = num(item[L1.NET_CHANGE_PERCENT]);
  // Recompute change from the prior close when the last price moved but the change field wasn't sent.
  if (netChange === undefined) netChange = closePrice ? lastPrice - closePrice : prev?.netChange;
  if (netPercentChange === undefined) netPercentChange = closePrice ? ((lastPrice - closePrice) / closePrice) * 100 : prev?.netPercentChange;

  const previousPrice = prev?.lastPrice;
  const priceDirection: StreamingQuote["priceDirection"] =
    previousPrice === undefined || lastPrice === previousPrice ? "unchanged" : lastPrice > previousPrice ? "up" : "down";

  return {
    ...(prev ?? {}),
    symbol,
    lastPrice,
    bidPrice: pick(L1.BID, prev?.bidPrice),
    askPrice: pick(L1.ASK, prev?.askPrice),
    bidSize: pick(L1.BID_SIZE, prev?.bidSize),
    askSize: pick(L1.ASK_SIZE, prev?.askSize),
    volume: pick(L1.TOTAL_VOLUME, prev?.volume),
    lastSize: pick(L1.LAST_SIZE, prev?.lastSize),
    highPrice: pick(L1.HIGH, prev?.highPrice),
    lowPrice: pick(L1.LOW, prev?.lowPrice),
    openPrice: pick(L1.OPEN, prev?.openPrice),
    closePrice,
    netChange,
    netPercentChange,
    mark: pick(L1.MARK, prev?.mark),
    tradeTime: pick(L1.TRADE_TIME, prev?.tradeTime),
    source: undefined,
    isPreviousClose: false,
    isLive: true,
    viaStream: true,
    previousPrice,
    priceDirection,
    lastUpdated: new Date(now),
  };
}

/** Wrap a REST quote as a StreamingQuote. */
export function fromRestQuote(prev: StreamingQuote | undefined, q: SchwabQuote, now: number): StreamingQuote {
  const previousPrice = prev?.lastPrice;
  const priceDirection: StreamingQuote["priceDirection"] =
    previousPrice === undefined || q.lastPrice === previousPrice ? "unchanged" : q.lastPrice > previousPrice ? "up" : "down";
  return {
    ...q,
    symbol: q.symbol.toUpperCase(),
    isLive: isLiveSource(q),
    viaStream: false,
    previousPrice,
    priceDirection,
    lastUpdated: new Date(now),
  };
}

/* ----------------------------------------------------------------------------
 * Feed
 * ------------------------------------------------------------------------- */

const WS_OPEN = 1;

export class SchwabFeed {
  private deps: Required<Omit<FeedDeps, "log">> & { log: (...args: unknown[]) => void };
  private subs = new Map<number, QuoteSubscription>();
  private nextId = 1;
  private quotes = new Map<string, StreamingQuote>();
  private statusListeners = new Set<(s: FeedStatus) => void>();
  private activityListeners = new Set<(a: AccountActivityItem[]) => void>();
  private bookSubs = new Map<number, BookSubscription>();
  private venueBooks = new Map<string, Map<BookVenue, VenueBook>>();
  private bookStatus = new Map<string, { status: BookStatus; message?: string }>();
  private bookKey = ""; // book symbols currently subscribed on the socket

  private status: FeedStatus = "idle";
  private socket: WebSocketLike | null = null;
  private authenticated = false;
  private streamedKey = ""; // symbols currently subscribed on the socket
  private accountSubscribed = false;
  private connectFailures = 0;
  private reconnectTimer: unknown = null;
  private idleTimer: unknown = null;
  private pollTimer: unknown = null;
  private watchdogTimer: unknown = null;
  private lastStreamDataAt = 0;
  private coolOffUntil = 0;
  private polling = false;
  private closingWasAuthenticated = false;
  private seedScheduled = false;

  constructor(deps: FeedDeps) {
    this.deps = {
      now: () => Date.now(),
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (id) => globalThis.clearTimeout(id as number),
      log: () => {},
      ...deps,
    } as SchwabFeed["deps"];
  }

  /* ---- public API ---------------------------------------------------- */

  subscribe(sub: QuoteSubscription): () => void {
    const id = this.nextId++;
    this.subs.set(id, { ...sub, symbols: sub.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean) });
    this.reconcile();
    return () => {
      if (this.subs.delete(id)) this.reconcile();
    };
  }

  /** Live Level 2 book for one symbol (streaming only). */
  subscribeBook(sub: BookSubscription): () => void {
    const id = this.nextId++;
    const entry = { ...sub, symbol: sub.symbol.trim().toUpperCase() };
    if (!entry.symbol) return () => {};
    this.bookSubs.set(id, entry);
    const known = this.bookStatus.get(entry.symbol);
    entry.onStatus?.(known?.status ?? (this.authenticated ? "waiting" : "needs-stream"), known?.message);
    const book = this.getBook(entry.symbol);
    if (book) entry.onBook(book);
    this.reconcile();
    return () => {
      if (this.bookSubs.delete(id)) this.reconcile();
    };
  }

  getBook(symbol: string): BookSnapshot | null {
    const venues = this.venueBooks.get(symbol.toUpperCase());
    return venues ? mergeBooks(Array.from(venues.values())) : null;
  }

  onStatus(listener: (s: FeedStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onAccountActivity(listener: (items: AccountActivityItem[]) => void): () => void {
    this.activityListeners.add(listener);
    if (this.authenticated) this.subscribeAccount();
    return () => this.activityListeners.delete(listener);
  }

  getStatus(): FeedStatus {
    return this.status;
  }

  getQuote(symbol: string): StreamingQuote | undefined {
    return this.quotes.get(symbol.toUpperCase());
  }

  /** Fetch fresh REST quotes now for these symbols (or all subscribed). */
  async pollNow(symbols?: string[]): Promise<void> {
    const list = symbols?.length ? symbols.map((s) => s.toUpperCase()) : this.unionSymbols();
    if (list.length === 0) return;
    try {
      const fetched = await this.deps.fetchQuotes(list);
      const now = this.deps.now();
      for (const q of fetched) {
        if (!q?.symbol || !Number.isFinite(q.lastPrice)) continue;
        const merged = fromRestQuote(this.quotes.get(q.symbol.toUpperCase()), q, now);
        // A fallback quote (delayed / previous close) never replaces a recent live quote.
        const existing = this.quotes.get(merged.symbol);
        if (existing?.isLive && !merged.isLive && now - existing.lastUpdated.getTime() < LIVE_QUOTE_GRACE_MS) continue;
        this.quotes.set(merged.symbol, merged);
        this.emit(merged);
      }
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (!/rate|429/i.test(msg)) this.deps.log("[SchwabFeed] poll error:", msg);
    }
  }

  /** Stop everything (tests / sign-out). */
  dispose(): void {
    this.subs.clear();
    this.statusListeners.clear();
    this.activityListeners.clear();
    this.bookSubs.clear();
    this.stopPolling();
    this.closeSocket();
    for (const t of [this.reconnectTimer, this.idleTimer, this.watchdogTimer]) if (t) this.deps.clearTimeout(t);
  }

  /* ---- internals ----------------------------------------------------- */

  private unionSymbols(): string[] {
    const set = new Set<string>();
    this.subs.forEach((s) => s.symbols.forEach((sym) => set.add(sym)));
    return Array.from(set).sort();
  }

  private bookSymbols(): string[] {
    const set = new Set<string>();
    this.bookSubs.forEach((s) => set.add(s.symbol));
    return Array.from(set).sort().slice(0, MAX_BOOK_SYMBOLS);
  }

  private wantsSocket(): boolean {
    for (const s of this.subs.values()) if (s.useWebSocket !== false && s.symbols.length) return true;
    return this.activityListeners.size > 0 || this.bookSubs.size > 0;
  }

  /** Nothing at all wants data (quotes, books or account activity). */
  private nothingWanted(): boolean {
    return this.unionSymbols().length === 0 && this.activityListeners.size === 0 && this.bookSubs.size === 0;
  }

  private setBookStatus(symbol: string, status: BookStatus, message?: string) {
    const prev = this.bookStatus.get(symbol);
    if (prev?.status === status && prev?.message === message) return;
    this.bookStatus.set(symbol, { status, message });
    this.bookSubs.forEach((s) => {
      if (s.symbol === symbol) s.onStatus?.(status, message);
    });
  }

  private setAllBookStatus(status: BookStatus, message?: string) {
    for (const sym of new Set(Array.from(this.bookSubs.values()).map((s) => s.symbol))) {
      // A refusal from Schwab sticks until the next successful login.
      if (this.bookStatus.get(sym)?.status === "unavailable" && status !== "waiting") continue;
      this.setBookStatus(sym, status, message);
    }
  }

  private pollInterval(): number {
    let ms = Infinity;
    this.subs.forEach((s) => {
      if (s.symbols.length) ms = Math.min(ms, s.pollMs ?? DEFAULT_POLL_MS);
    });
    return Math.max(MIN_POLL_MS, Number.isFinite(ms) ? ms : DEFAULT_POLL_MS);
  }

  private setStatus(next: FeedStatus) {
    if (next === this.status) return;
    this.status = next;
    this.statusListeners.forEach((l) => l(next));
  }

  private emit(q: StreamingQuote) {
    this.subs.forEach((s) => {
      if (s.symbols.includes(q.symbol)) {
        try {
          s.onQuote(q);
        } catch (err) {
          this.deps.log("[SchwabFeed] subscriber error:", err);
        }
      }
    });
  }

  /** Bring connection, subscriptions and polling in line with current subscribers. */
  private reconcile() {
    const symbols = this.unionSymbols();

    if (this.nothingWanted()) {
      this.stopPolling();
      // Stop the heavy Level 2 stream now; the socket itself closes after a short idle wait.
      if (this.authenticated) this.sendBookSubscriptions();
      if (this.socket && !this.idleTimer) {
        this.idleTimer = this.deps.setTimeout(() => {
          this.idleTimer = null;
          if (this.nothingWanted()) {
            this.closeSocket();
            this.setStatus("idle");
          }
        }, IDLE_CLOSE_MS);
      }
      if (!this.socket) this.setStatus("idle");
      return;
    }
    if (this.idleTimer) {
      this.deps.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.authenticated) {
      this.sendSubscriptions();
      this.sendBookSubscriptions();
    } else {
      if (symbols.length) {
        if (this.polling) this.scheduleSeed();
        else this.startPolling();
      }
      if (this.bookSubs.size && !this.socket) this.setAllBookStatus("needs-stream");
      if (this.wantsSocket() && !this.socket && !this.reconnectTimer && this.deps.now() >= this.coolOffUntil) {
        void this.connect();
      }
    }
  }

  private startPolling() {
    if (this.polling) return;
    this.polling = true;
    if (this.status !== "connecting") this.setStatus("polling");
    const tick = async () => {
      if (!this.polling) return;
      await this.pollNow();
      if (!this.polling) return;
      this.pollTimer = this.deps.setTimeout(() => void tick(), this.pollInterval());
    };
    // First poll on the next microtask so components mounting together share one request.
    void Promise.resolve().then(tick);
  }

  /** Fetch quotes for newly subscribed symbols now instead of waiting for the next poll. */
  private scheduleSeed() {
    if (this.seedScheduled) return;
    this.seedScheduled = true;
    void Promise.resolve().then(() => {
      this.seedScheduled = false;
      const missing = this.unionSymbols().filter((sym) => !this.quotes.has(sym));
      if (missing.length) void this.pollNow(missing);
    });
  }

  private stopPolling() {
    this.polling = false;
    if (this.pollTimer) this.deps.clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  private async connect() {
    this.setStatus("connecting");
    let token: string | null = null;
    try {
      token = await this.deps.getAccessToken();
    } catch {
      token = null;
    }
    if (!token) {
      // Signed out: poll, and check again later in case the user signs in.
      this.setStatus(this.polling ? "polling" : "idle");
      this.scheduleReconnect(SIGNED_OUT_RETRY_MS);
      return;
    }
    if (this.socket || !this.wantsSocket()) return;

    let ws: WebSocketLike;
    try {
      ws = this.deps.createSocket(this.deps.streamUrl, ["authorization", token]);
    } catch (err) {
      this.deps.log("[SchwabFeed] socket create failed:", err);
      this.onConnectFailure();
      return;
    }
    this.socket = ws;

    ws.onmessage = (ev) => {
      let msg: StreamMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.handleMessage(msg);
    };
    ws.onerror = () => {
      /* onclose follows; handled there */
    };
    ws.onclose = () => {
      const wasAuthenticated = this.authenticated || this.closingWasAuthenticated;
      this.closingWasAuthenticated = false;
      if (this.socket === ws) this.socket = null;
      this.authenticated = false;
      this.streamedKey = "";
      this.accountSubscribed = false;
      this.bookKey = "";
      this.venueBooks.clear();
      this.stopWatchdog();
      if (this.bookSubs.size) this.setAllBookStatus("needs-stream");
      if (this.nothingWanted()) {
        this.setStatus("idle");
        return;
      }
      if (this.unionSymbols().length) this.startPolling();
      this.setStatus("polling");
      if (!wasAuthenticated) this.onConnectFailure();
      else this.scheduleReconnect(BACKOFF_STEPS_MS[0]);
    };
  }

  private handleMessage(msg: StreamMessage) {
    switch (msg?.type) {
      case "connected": {
        this.authenticated = true;
        this.connectFailures = 0;
        this.coolOffUntil = 0;
        this.stopPolling();
        this.setStatus("streaming");
        this.lastStreamDataAt = this.deps.now();
        this.sendSubscriptions(true);
        this.bookStatus.clear();
        this.sendBookSubscriptions(true);
        if (this.activityListeners.size) this.subscribeAccount();
        this.startWatchdog();
        // One REST fetch so subscribers get full quotes right away; the stream then sends changes.
        void this.pollNow();
        return;
      }
      case "data": {
        if (msg.service === STREAMING_SERVICE && Array.isArray(msg.content)) {
          this.lastStreamDataAt = this.deps.now();
          const now = this.deps.now();
          for (const item of msg.content) {
            const merged = mergeLevelOne(this.quotes.get(String(item?.key ?? "").toUpperCase()), item, now);
            if (!merged) continue;
            this.quotes.set(merged.symbol, merged);
            this.emit(merged);
          }
        } else if (msg.service && SERVICE_VENUE[msg.service] && Array.isArray(msg.content)) {
          const venue = SERVICE_VENUE[msg.service];
          const now = this.deps.now();
          for (const item of msg.content) {
            const vb = parseBookItem(item, venue, now);
            if (!vb) continue;
            let venues = this.venueBooks.get(vb.symbol);
            if (!venues) this.venueBooks.set(vb.symbol, (venues = new Map()));
            venues.set(venue, vb);
            const merged = mergeBooks(Array.from(venues.values()));
            if (!merged) continue;
            this.setBookStatus(vb.symbol, "live");
            this.bookSubs.forEach((s) => {
              if (s.symbol !== vb.symbol) return;
              try {
                s.onBook(merged);
              } catch (err) {
                this.deps.log("[SchwabFeed] book subscriber error:", err);
              }
            });
          }
        } else if (msg.service === "ACCT_ACTIVITY" && Array.isArray(msg.content)) {
          const items: AccountActivityItem[] = msg.content.map((item) => ({
            accountNumber: String(item.key ?? item["0"] ?? ""),
            messageType: String(item["1"] ?? "UPDATE"),
            messageData: item["2"] || item,
            timestamp: new Date(this.deps.now()),
          }));
          this.activityListeners.forEach((l) => l(items));
        }
        return;
      }
      case "disconnected": {
        this.closeSocket();
        return;
      }
      case "error": {
        this.deps.log("[SchwabFeed] stream error:", msg.message);
        if (msg.service && SERVICE_VENUE[msg.service]) {
          // One venue refusing is fine as long as the other sends books.
          this.venueRefusals.add(msg.service);
          if (this.venueRefusals.size >= Object.keys(SERVICE_VENUE).length) {
            this.setAllBookStatus("unavailable", msg.message || "Schwab did not send Level 2 data for this account.");
          }
          return;
        }
        if (!this.authenticated) this.closeSocket();
        return;
      }
      default:
        return;
    }
  }

  /** Subscribe the socket to the current union of symbols (SUBS replaces the previous list). */
  private sendSubscriptions(force = false) {
    if (!this.socket || this.socket.readyState !== WS_OPEN || !this.authenticated) return;
    const symbols = this.unionSymbols();
    const key = symbols.join(",");
    if (!force && key === this.streamedKey) return;
    if (symbols.length === 0) {
      if (this.streamedKey) {
        this.socket.send(JSON.stringify({ action: "unsubscribe", service: STREAMING_SERVICE, symbols: this.streamedKey.split(",") }));
      }
    } else {
      this.socket.send(JSON.stringify({ action: "subscribe", service: STREAMING_SERVICE, symbols, fields: LEVEL_ONE_FIELDS }));
      // Fill in newly added symbols right away instead of waiting for their next change.
      const before = new Set(this.streamedKey ? this.streamedKey.split(",") : []);
      const added = symbols.filter((s) => !before.has(s) && !this.quotes.get(s)?.isLive);
      if (added.length && !force) void this.pollNow(added);
    }
    this.streamedKey = key;
  }

  private venueRefusals = new Set<string>();

  /** Subscribe the socket to the current book symbols (SUBS replaces the previous list). */
  private sendBookSubscriptions(force = false) {
    if (!this.socket || this.socket.readyState !== WS_OPEN || !this.authenticated) return;
    const symbols = this.bookSymbols();
    const key = symbols.join(",");
    if (!force && key === this.bookKey) return;
    if (force) this.venueRefusals.clear();
    const before = this.bookKey ? this.bookKey.split(",") : [];
    if (symbols.length) this.socket.send(JSON.stringify({ action: "subscribe_book", symbols }));
    else if (before.length) this.socket.send(JSON.stringify({ action: "unsubscribe_book", symbols: before }));
    for (const s of before) if (!symbols.includes(s)) this.venueBooks.delete(s);
    for (const s of symbols) if (!this.bookStatus.has(s) || this.bookStatus.get(s)?.status === "needs-stream") this.setBookStatus(s, "waiting");
    this.bookKey = key;
  }

  private subscribeAccount() {
    if (this.accountSubscribed || !this.socket || this.socket.readyState !== WS_OPEN) return;
    this.socket.send(JSON.stringify({ action: "subscribe_account" }));
    this.accountSubscribed = true;
  }

  private startWatchdog() {
    this.stopWatchdog();
    const check = () => {
      this.watchdogTimer = null;
      if (!this.authenticated) return;
      if (this.deps.now() - this.lastStreamDataAt >= STREAM_WATCHDOG_MS && this.unionSymbols().length) {
        // Quiet stream (market closed, or subscription silently failed): refresh once by REST.
        void this.pollNow();
        this.lastStreamDataAt = this.deps.now();
      }
      this.watchdogTimer = this.deps.setTimeout(check, STREAM_WATCHDOG_MS);
    };
    this.watchdogTimer = this.deps.setTimeout(check, STREAM_WATCHDOG_MS);
  }

  private stopWatchdog() {
    if (this.watchdogTimer) this.deps.clearTimeout(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  private onConnectFailure() {
    this.connectFailures++;
    if (this.connectFailures >= MAX_CONNECT_FAILURES) {
      this.connectFailures = 0;
      this.coolOffUntil = this.deps.now() + COOL_OFF_MS;
      this.scheduleReconnect(COOL_OFF_MS);
      return;
    }
    this.scheduleReconnect(BACKOFF_STEPS_MS[Math.min(this.connectFailures - 1, BACKOFF_STEPS_MS.length - 1)]);
  }

  private scheduleReconnect(delay: number) {
    if (this.reconnectTimer) return;
    this.reconnectTimer = this.deps.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.socket && this.wantsSocket()) void this.connect();
    }, delay);
  }

  private closeSocket() {
    const ws = this.socket;
    if (!ws) return;
    this.socket = null;
    this.closingWasAuthenticated = this.authenticated;
    this.authenticated = false;
    this.streamedKey = "";
    this.accountSubscribed = false;
    this.bookKey = "";
    this.venueBooks.clear();
    this.stopWatchdog();
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
}
