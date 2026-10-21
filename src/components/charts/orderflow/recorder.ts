/**
 * Records live order flow for a symbol while any chart wants it: trades
 * (classed buy/sell) from the Level 1 stream and Level 2 book history.
 *
 * Schwab doesn't provide past order book or tick history, so recording
 * starts when the chart opens. One recorder per symbol is shared by every
 * chart on the page and kept for a few minutes after the last one closes,
 * so switching tabs or timeframes doesn't lose what's been recorded.
 */
import type { BookSubscription, BookStatus, FeedStatus, QuoteSubscription } from "@/lib/marketData/schwabFeed";
import type { BookSnapshot } from "@/lib/marketData/book";
import { BookHistory, PrintLog, TradeClassifier } from "./flow";

export interface FeedLike {
  subscribe(sub: QuoteSubscription): () => void;
  subscribeBook(sub: BookSubscription): () => void;
  onStatus(listener: (s: FeedStatus) => void): () => void;
  getStatus(): FeedStatus;
}

const NOTIFY_MS = 250;
/** Keep a symbol's recording this long after the last chart lets go. */
const KEEP_MS = 5 * 60_000;
/** Book times further than this from our clock are ignored (use our clock). */
const CLOCK_SKEW_MS = 5 * 60_000;

export class OrderFlowRecorder {
  readonly prints = new PrintLog();
  readonly book = new BookHistory();
  private classifier = new TradeClassifier();
  latestBook: BookSnapshot | null = null;
  bookStatus: BookStatus = "waiting";
  bookMessage: string | undefined;
  feedStatus: FeedStatus = "idle";
  lastPrice: number | null = null;
  /** Changes on every update; charts redraw when it changes. */
  version = 0;
  readonly startedAt: number;

  private listeners = new Set<() => void>();
  private offs: Array<() => void> = [];
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly symbol: string,
    private feed: FeedLike,
    private now: () => number = () => Date.now(),
  ) {
    this.startedAt = now();
  }

  start() {
    if (this.offs.length) return;
    this.feedStatus = this.feed.getStatus();
    this.offs.push(
      this.feed.onStatus((s) => {
        // Any change (drop, reconnect) is a break: the next chunk may hold trades from both sides of it.
        if (s !== this.feedStatus) this.classifier.markGap();
        this.feedStatus = s;
        this.changed();
      }),
      this.feed.subscribe({
        symbols: [this.symbol],
        useWebSocket: true,
        pollMs: 2000,
        onQuote: (q) => {
          if (!q.isLive) return;
          this.lastPrice = q.lastPrice;
          // Only live stream updates: REST refreshes are too coarse to tell buys
          // from sells, and their day-volume can lag the stream's.
          if (!q.viaStream) return;
          if (this.feed.getStatus() !== "streaming") this.classifier.markGap();
          const p = this.classifier.push({ price: q.lastPrice, bid: q.bidPrice, ask: q.askPrice, volume: q.volume, time: q.tradeTime }, this.now());
          if (p) this.prints.add(p);
          this.changed();
        },
      }),
      this.feed.subscribeBook({
        symbol: this.symbol,
        onBook: (b) => {
          this.latestBook = b;
          const now = this.now();
          const t = Math.abs(b.time - now) < CLOCK_SKEW_MS ? b.time : now;
          this.book.add(t, b.bids, b.asks);
          this.changed();
        },
        onStatus: (s, msg) => {
          this.bookStatus = s;
          this.bookMessage = msg;
          this.changed();
        },
      }),
    );
  }

  stop() {
    this.offs.splice(0).forEach((off) => off());
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    this.notifyTimer = null;
  }

  get running() {
    return this.offs.length > 0;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Throttled: at most a few redraws per second however fast data comes. */
  private changed() {
    this.version++;
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      this.listeners.forEach((l) => {
        try {
          l();
        } catch (err) {
          console.warn("[orderflow] listener error", err);
        }
      });
    }, NOTIFY_MS);
  }
}

/* ---- shared per symbol --------------------------------------------------- */

const recorders = new Map<string, { rec: OrderFlowRecorder; refs: number; stopTimer: ReturnType<typeof setTimeout> | null }>();
let defaultFeed: FeedLike | null = null;

/** Set the feed used by acquireOrderFlow (the app's shared Schwab feed). */
export function setOrderFlowFeed(feed: FeedLike) {
  defaultFeed = feed;
}

export function acquireOrderFlow(symbol: string, feed: FeedLike | null = defaultFeed): { rec: OrderFlowRecorder; release: (now?: boolean) => void } | null {
  const sym = symbol.trim().toUpperCase();
  if (!sym || !feed) return null;
  let e = recorders.get(sym);
  if (!e) {
    e = { rec: new OrderFlowRecorder(sym, feed), refs: 0, stopTimer: null };
    recorders.set(sym, e);
  }
  if (e.stopTimer) {
    clearTimeout(e.stopTimer);
    e.stopTimer = null;
  }
  e.refs++;
  e.rec.start();
  const entry = e;
  let released = false;
  return {
    rec: e.rec,
    /** now = the user turned order flow off: stop streaming Level 2 right away. */
    release: (now = false) => {
      if (released) return;
      released = true;
      entry.refs--;
      if (entry.refs > 0) return;
      if (now) {
        entry.rec.stop();
        recorders.delete(sym);
        return;
      }
      entry.stopTimer = setTimeout(() => {
        if (entry.refs > 0) return;
        entry.rec.stop();
        recorders.delete(sym);
      }, KEEP_MS);
    },
  };
}

/** The recorder for a symbol if one is running (used while drawing). */
export function peekOrderFlow(symbol: string | undefined | null): OrderFlowRecorder | null {
  return symbol ? recorders.get(symbol.toUpperCase())?.rec ?? null : null;
}

/** Tests only. */
export function resetOrderFlowRecorders() {
  recorders.forEach((e) => {
    if (e.stopTimer) clearTimeout(e.stopTimer);
    e.rec.stop();
  });
  recorders.clear();
}
