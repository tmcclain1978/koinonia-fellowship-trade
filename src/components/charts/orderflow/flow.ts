/**
 * Order flow math (pure, unit-tested).
 *
 * Trades: Schwab's Level 1 stream bundles trades (about every half second),
 * so we work from the change in day volume between updates. Each new chunk
 * of volume is classed as bought or sold by where it traded against the
 * quote just before it:
 *   at/above the ask -> buyers took it ("buy"),  at/below the bid -> "sell",
 *   in between -> closer side, then the tick rule (up from the last different
 *   price = buy, down = sell).
 * After a gap in the stream (reconnect) the lump of volume is "unknown" and
 * is left out of delta, so a reconnect can't fake a huge buy or sell.
 *
 * Book history: Level 2 snapshots, at most one per second, for the heatmap.
 */

export type Side = "buy" | "sell" | "unknown";

export interface Print {
  time: number;
  price: number;
  size: number;
  side: Side;
}

export interface QuoteTick {
  price: number;
  bid?: number;
  ask?: number;
  /** Day volume so far. */
  volume?: number;
  /** Trade time from the exchange (ms), if known. */
  time?: number;
}

/** No message at all for this long = we may have missed trades. */
export const GAP_MS = 60_000;

const pos = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

export class TradeClassifier {
  private prev: { price: number; bid?: number; ask?: number; volume?: number; at: number } | null = null;
  private lastDiffPrice: number | null = null;
  private lastDir: "buy" | "sell" | null = null;
  private gap = false;

  /** The stream dropped or reconnected: the next chunk of volume can't be classed. */
  markGap() {
    this.gap = true;
  }

  reset() {
    this.prev = null;
    this.lastDiffPrice = null;
    this.lastDir = null;
  }

  push(q: QuoteTick, now: number): Print | null {
    if (!pos(q.price)) return null;
    const prev = this.prev;
    const bid = pos(q.bid) ? q.bid : prev?.bid;
    const ask = pos(q.ask) ? q.ask : prev?.ask;
    const volume = typeof q.volume === "number" && Number.isFinite(q.volume) ? q.volume : prev?.volume;
    const keep = (at: number) => {
      this.prev = { price: q.price, bid, ask, volume, at };
    };

    if (!prev || prev.volume === undefined || volume === undefined || volume < prev.volume) {
      // First look, or the day's volume restarted: set a baseline only.
      keep(now);
      return null;
    }
    const dv = volume - prev.volume;
    if (dv <= 0) {
      // Quote change only: remember the new bid/ask.
      this.prev = { ...prev, price: q.price, bid, ask, at: now };
      return null;
    }

    let side: Side;
    if (this.gap || now - prev.at > GAP_MS) side = "unknown";
    else side = this.classify(q.price, prev.bid ?? bid, prev.ask ?? ask);
    if (side !== "unknown") this.lastDir = side;
    if (this.lastDiffPrice === null || q.price !== this.lastDiffPrice) {
      // Track the tick-rule reference after classifying with the previous one.
      this.lastDiffPrice = q.price;
    }
    this.gap = false;
    keep(now);
    return { time: pos(q.time) ? q.time : now, price: q.price, size: dv, side };
  }

  private classify(price: number, bid?: number, ask?: number): Side {
    if (pos(ask) && price >= ask) return "buy";
    if (pos(bid) && price <= bid) return "sell";
    if (pos(bid) && pos(ask) && ask > bid) {
      const mid = (bid + ask) / 2;
      if (price > mid) return "buy";
      if (price < mid) return "sell";
    }
    if (this.lastDiffPrice !== null) {
      if (price > this.lastDiffPrice) return "buy";
      if (price < this.lastDiffPrice) return "sell";
    }
    return this.lastDir ?? "unknown";
  }
}

/* ----------------------------------------------------------------------------
 * Prints store
 * ------------------------------------------------------------------------- */

export interface BarFlow {
  buy: number;
  sell: number;
  unknown: number;
  /** buy - sell */
  delta: number;
}

export interface FootprintRow {
  price: number;
  buy: number;
  sell: number;
}

const MAX_PRINTS = 200_000;

/** First index with prints[i].time >= t. */
function lowerBound(prints: Print[], t: number): number {
  let lo = 0, hi = prints.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prints[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class PrintLog {
  readonly prints: Print[] = [];
  /** Session volume by price (cents), for the depth ladder. */
  private vap = new Map<number, { buy: number; sell: number }>();
  /** Session totals since recording began. */
  totals = { buy: 0, sell: 0, unknown: 0 };

  add(p: Print) {
    const last = this.prints[this.prints.length - 1];
    // Keep time order (exchange trade times can arrive a hair out of order).
    const time = last && p.time < last.time ? last.time : p.time;
    this.prints.push(time === p.time ? p : { ...p, time });
    if (this.prints.length > MAX_PRINTS) this.prints.splice(0, this.prints.length - MAX_PRINTS);
    this.totals[p.side] += p.size;
    if (p.side !== "unknown") {
      const k = Math.round(p.price * 100);
      const cur = this.vap.get(k) ?? { buy: 0, sell: 0 };
      cur[p.side] += p.size;
      this.vap.set(k, cur);
    }
  }

  clear() {
    this.prints.length = 0;
    this.vap.clear();
    this.totals = { buy: 0, sell: 0, unknown: 0 };
  }

  get firstTime(): number | null {
    return this.prints[0]?.time ?? null;
  }

  range(from: number, to: number): Print[] {
    return this.prints.slice(lowerBound(this.prints, from), lowerBound(this.prints, to));
  }

  /** Bought / sold volume at a price this session (to the cent). */
  volumeAt(price: number): { buy: number; sell: number } {
    return this.vap.get(Math.round(price * 100)) ?? { buy: 0, sell: 0 };
  }

  /**
   * Flow per bar. Bar i covers [starts[i], starts[i+1]); the last bar is
   * open-ended. Bars before recording began get null (no data, not zero).
   */
  barFlows(starts: number[]): Array<BarFlow | null> {
    const first = this.firstTime;
    return starts.map((start, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : Infinity;
      if (first === null || end <= first) return null;
      const f: BarFlow = { buy: 0, sell: 0, unknown: 0, delta: 0 };
      for (let k = lowerBound(this.prints, start); k < this.prints.length && this.prints[k].time < end; k++) {
        const p = this.prints[k];
        f[p.side] += p.size;
      }
      f.delta = f.buy - f.sell;
      return f;
    });
  }

  /** Bought and sold volume per price row inside [from, to), rows of `rowSize`. */
  footprint(from: number, to: number, rowSize: number): FootprintRow[] {
    const rows = new Map<number, FootprintRow>();
    for (const p of this.range(from, to)) {
      if (p.side === "unknown") continue;
      const k = Math.round(Math.floor(p.price / rowSize + 1e-9) * rowSize * 1e6);
      let r = rows.get(k);
      if (!r) rows.set(k, (r = { price: k / 1e6, buy: 0, sell: 0 }));
      r[p.side] += p.size;
    }
    return Array.from(rows.values()).sort((a, b) => b.price - a.price);
  }
}

/** Running total of delta; null until recording starts, then carried forward. */
export function cumulativeDelta(flows: Array<BarFlow | null>): Array<number | null> {
  let total = 0;
  let started = false;
  return flows.map((f) => {
    if (!f) return started ? total : null;
    started = true;
    total += f.delta;
    return total;
  });
}

/* ----------------------------------------------------------------------------
 * Book history (heatmap)
 * ------------------------------------------------------------------------- */

export interface BookFrame {
  time: number;
  /** [price, size, price, size, ...] best first */
  bids: Float64Array;
  asks: Float64Array;
}

export const BOOK_LEVELS_KEPT = 30;
const MAX_FRAMES = 4 * 60 * 60; // 4 hours at one per second
const FRAME_MS = 1000;

const pack = (levels: Array<{ price: number; size: number }>) => {
  const n = Math.min(levels.length, BOOK_LEVELS_KEPT);
  const a = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    a[i * 2] = levels[i].price;
    a[i * 2 + 1] = levels[i].size;
  }
  return a;
};

export class BookHistory {
  readonly frames: BookFrame[] = [];

  /** Keep the latest book for each second. */
  add(time: number, bids: Array<{ price: number; size: number }>, asks: Array<{ price: number; size: number }>) {
    const frame: BookFrame = { time, bids: pack(bids), asks: pack(asks) };
    const last = this.frames[this.frames.length - 1];
    if (last && Math.floor(last.time / FRAME_MS) === Math.floor(time / FRAME_MS)) {
      this.frames[this.frames.length - 1] = { ...frame, time: last.time };
      return;
    }
    if (last && time < last.time) return;
    this.frames.push(frame);
    if (this.frames.length > MAX_FRAMES) this.frames.splice(0, this.frames.length - MAX_FRAMES);
  }

  clear() {
    this.frames.length = 0;
  }

  /** Frames that overlap [from, to): includes the one in force at `from`. */
  range(from: number, to: number): BookFrame[] {
    const f = this.frames;
    let lo = 0, hi = f.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (f[mid].time < from) lo = mid + 1;
      else hi = mid;
    }
    const start = Math.max(0, lo - 1);
    let end = lo;
    while (end < f.length && f[end].time < to) end++;
    return f.slice(start, end);
  }
}

/** Smallest price step seen in a frame (cents for most stocks). */
export function priceStep(frame: BookFrame | undefined, fallback = 0.01): number {
  if (!frame) return fallback;
  let step = Infinity;
  for (const side of [frame.bids, frame.asks]) {
    for (let i = 2; i < side.length; i += 2) {
      const d = Math.abs(side[i] - side[i - 2]);
      if (d > 1e-9 && d < step) step = d;
    }
  }
  return Number.isFinite(step) ? Math.max(step, 0.0001) : fallback;
}

/** Value at the given percentile (0-1) of a list; 0 for an empty list. */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}

/** A tidy row size for the footprint so rows are at least `minPx` tall. */
export function footprintRowSize(pxPerDollar: number, minPx = 12, tick = 0.01): number {
  if (!(pxPerDollar > 0)) return tick;
  const raw = minPx / pxPerDollar;
  const steps = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
  return steps.find((s) => s >= raw && s >= tick) ?? steps[steps.length - 1];
}
