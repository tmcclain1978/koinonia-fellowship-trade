/**
 * Level 2 order book from Schwab's NASDAQ_BOOK / NYSE_BOOK streams.
 *
 * Message shape (numeric keys, as relabeled by schwab-py):
 *   { key: "AAPL", 1: bookTime, 2: [bid levels], 3: [ask levels] }
 *   level = { 0: price, 1: total size, 2: number of venues, 3: [{ 0: venue id, 1: size, 2: time }] }
 * Each message is the venue's current book, so a new one replaces the old.
 */

export type BookVenue = "NASDAQ" | "NYSE";

export interface BookLevel {
  price: number;
  size: number;
  /** How many market makers / exchanges are quoting at this price. */
  venues: number;
}

export interface VenueBook {
  symbol: string;
  venue: BookVenue;
  time: number;
  bids: BookLevel[];
  asks: BookLevel[];
}

export interface BookSnapshot {
  symbol: string;
  time: number;
  /** Highest price first. */
  bids: BookLevel[];
  /** Lowest price first. */
  asks: BookLevel[];
}

export const SERVICE_VENUE: Record<string, BookVenue> = { NASDAQ_BOOK: "NASDAQ", NYSE_BOOK: "NYSE" };

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : NaN;
};

function parseLevels(raw: unknown): BookLevel[] {
  if (!Array.isArray(raw)) return [];
  const out: BookLevel[] = [];
  for (const l of raw) {
    if (!l || typeof l !== "object") continue;
    const r = l as Record<string, unknown>;
    const price = num(r["0"] ?? r.BID_PRICE ?? r.ASK_PRICE);
    const size = num(r["1"] ?? r.TOTAL_VOLUME);
    if (!(price > 0) || !(size > 0)) continue;
    const list = r["3"] ?? r.BIDS ?? r.ASKS;
    const count = num(r["2"] ?? r.NUM_BIDS ?? r.NUM_ASKS);
    out.push({ price, size, venues: Number.isFinite(count) && count > 0 ? count : Array.isArray(list) ? list.length : 1 });
  }
  return out;
}

export function parseBookItem(item: Record<string, unknown>, venue: BookVenue, now: number): VenueBook | null {
  const symbol = String(item?.key ?? item?.["0"] ?? "").toUpperCase();
  if (!symbol) return null;
  const t = num(item["1"]);
  return {
    symbol,
    venue,
    time: t > 0 ? t : now,
    bids: parseLevels(item["2"]).sort((a, b) => b.price - a.price),
    asks: parseLevels(item["3"]).sort((a, b) => a.price - b.price),
  };
}

const key = (p: number) => Math.round(p * 1e6);

/** Combine venues into one book: sizes at the same price add up. */
export function mergeBooks(books: VenueBook[]): BookSnapshot | null {
  if (!books.length) return null;
  const side = (pick: (b: VenueBook) => BookLevel[], desc: boolean) => {
    const m = new Map<number, BookLevel>();
    for (const b of books)
      for (const l of pick(b)) {
        const k = key(l.price);
        const cur = m.get(k);
        if (cur) {
          cur.size += l.size;
          cur.venues += l.venues;
        } else m.set(k, { ...l });
      }
    return Array.from(m.values()).sort((a, b) => (desc ? b.price - a.price : a.price - b.price));
  };
  return {
    symbol: books[0].symbol,
    time: Math.max(...books.map((b) => b.time)),
    bids: side((b) => b.bids, true),
    asks: side((b) => b.asks, false),
  };
}

/**
 * Who is leaning on the book near the price: +1 = all size on the bid,
 * -1 = all on the ask, 0 = even. Uses the first `levels` prices per side.
 */
export function bookImbalance(s: BookSnapshot | null, levels = 5): number | null {
  if (!s) return null;
  const bid = s.bids.slice(0, levels).reduce((a, l) => a + l.size, 0);
  const ask = s.asks.slice(0, levels).reduce((a, l) => a + l.size, 0);
  return bid + ask > 0 ? (bid - ask) / (bid + ask) : null;
}
