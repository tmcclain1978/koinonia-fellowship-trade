import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SchwabFeed, type WebSocketLike, type BookStatus } from "@/lib/marketData/schwabFeed";
import { bookImbalance, mergeBooks, parseBookItem } from "@/lib/marketData/book";
import type { BookSnapshot } from "@/lib/marketData/book";

const level = (price: number, size: number, venues: Array<[string, number]> = [["NSDQ", size]]) => ({
  0: price, 1: size, 2: venues.length, 3: venues.map(([v, s]) => ({ 0: v, 1: s, 2: 1 })),
});

describe("Level 2 book parsing", () => {
  it("reads Schwab's numeric fields and sorts each side", () => {
    const b = parseBookItem({ key: "aapl", 1: 1_700_000_000_000, 2: [level(189.98, 300), level(190, 500, [["NSDQ", 300], ["ARCX", 200]])], 3: [level(190.05, 100), level(190.02, 800)] }, "NASDAQ", 5)!;
    expect(b.symbol).toBe("AAPL");
    expect(b.time).toBe(1_700_000_000_000);
    expect(b.bids.map((l) => l.price)).toEqual([190, 189.98]);
    expect(b.bids[0]).toEqual({ price: 190, size: 500, venues: 2 });
    expect(b.asks.map((l) => l.price)).toEqual([190.02, 190.05]);
  });

  it("skips broken levels and fills a missing time", () => {
    const b = parseBookItem({ key: "X", 2: [{ 0: "bad", 1: 5 }, { 0: 10, 1: 0 }, level(9.99, 100)], 3: "nope" }, "NYSE", 42)!;
    expect(b.time).toBe(42);
    expect(b.bids).toEqual([{ price: 9.99, size: 100, venues: 1 }]);
    expect(b.asks).toEqual([]);
  });

  it("adds Nasdaq and NYSE sizes at the same price", () => {
    const n = parseBookItem({ key: "SPY", 1: 1, 2: [level(500, 100)], 3: [level(500.01, 50)] }, "NASDAQ", 0)!;
    const y = parseBookItem({ key: "SPY", 1: 2, 2: [level(500, 200), level(499.99, 70)], 3: [level(500.02, 10)] }, "NYSE", 0)!;
    const m = mergeBooks([n, y])!;
    expect(m.time).toBe(2);
    expect(m.bids).toEqual([{ price: 500, size: 300, venues: 2 }, { price: 499.99, size: 70, venues: 1 }]);
    expect(m.asks.map((l) => [l.price, l.size])).toEqual([[500.01, 50], [500.02, 10]]);
  });

  it("imbalance: + when buyers stack the bid, - when sellers stack the ask", () => {
    const s = (bid: number, ask: number): BookSnapshot => ({ symbol: "X", time: 0, bids: [{ price: 1, size: bid, venues: 1 }], asks: [{ price: 1.01, size: ask, venues: 1 }] });
    expect(bookImbalance(s(300, 100))).toBeCloseTo(0.5);
    expect(bookImbalance(s(100, 300))).toBeCloseTo(-0.5);
    expect(bookImbalance(s(0, 0))).toBeNull();
  });
});

/* ---- feed ---------------------------------------------------------------- */

class FakeSocket implements WebSocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Array<{ action?: string; symbols?: string[] }> = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  constructor(public url: string, public protocols: string[]) {
    FakeSocket.all.push(this);
  }
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { this.readyState = 3; this.onclose?.({}); }
  msg(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
  authenticate() { this.readyState = 1; this.onopen?.({}); this.msg({ type: "connected" }); }
  book(service: string, content: unknown[]) { this.msg({ type: "data", service, content }); }
  get bookMsgs() { return this.sent.filter((m) => m.action === "subscribe_book" || m.action === "unsubscribe_book"); }
}

const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function makeFeed() {
  return new SchwabFeed({
    streamUrl: "wss://x/functions/v1/schwab-streaming",
    createSocket: (u, p) => new FakeSocket(u, p),
    getAccessToken: async () => "jwt",
    fetchQuotes: async (symbols) => symbols.map((s) => ({ symbol: s, lastPrice: 100 })),
  });
}

beforeEach(() => { FakeSocket.all = []; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe("SchwabFeed Level 2", () => {
  it("opens the stream for a book subscriber alone, with the sign-in as a subprotocol", async () => {
    const feed = makeFeed();
    const statuses: BookStatus[] = [];
    feed.subscribeBook({ symbol: "aapl", onBook: () => {}, onStatus: (s) => statuses.push(s) });
    await settle();
    expect(FakeSocket.all).toHaveLength(1);
    expect(FakeSocket.all[0].protocols).toEqual(["authorization", "jwt"]);
    expect(statuses[0]).toBe("needs-stream");
    FakeSocket.all[0].authenticate();
    expect(FakeSocket.all[0].bookMsgs).toEqual([{ action: "subscribe_book", symbols: ["AAPL"] }]);
    expect(statuses.at(-1)).toBe("waiting");
  });

  it("merges venues and delivers to subscribers of that symbol only", async () => {
    const feed = makeFeed();
    const a: BookSnapshot[] = [];
    const m: BookSnapshot[] = [];
    let status: BookStatus | undefined;
    feed.subscribeBook({ symbol: "AAPL", onBook: (b) => a.push(b), onStatus: (s) => (status = s) });
    feed.subscribeBook({ symbol: "MSFT", onBook: (b) => m.push(b) });
    await settle();
    const ws = FakeSocket.all[0];
    ws.authenticate();
    expect(ws.bookMsgs.at(-1)).toEqual({ action: "subscribe_book", symbols: ["AAPL", "MSFT"] });
    ws.book("NASDAQ_BOOK", [{ key: "AAPL", 1: 1, 2: [level(190, 100)], 3: [level(190.01, 40)] }]);
    ws.book("NYSE_BOOK", [{ key: "AAPL", 1: 2, 2: [level(190, 50)], 3: [] }]);
    expect(a).toHaveLength(2);
    expect(a[1].bids[0].size).toBe(150);
    expect(m).toHaveLength(0);
    expect(status).toBe("live");
    // A new venue snapshot replaces that venue's old one.
    ws.book("NASDAQ_BOOK", [{ key: "AAPL", 1: 3, 2: [level(190, 10)], 3: [] }]);
    expect(a.at(-1)!.bids[0].size).toBe(60);
    expect(feed.getBook("AAPL")!.bids[0].size).toBe(60);
  });

  it("updates and drops the book subscription as charts come and go", async () => {
    const feed = makeFeed();
    const off1 = feed.subscribeBook({ symbol: "AAPL", onBook: () => {} });
    const off2 = feed.subscribeBook({ symbol: "SPY", onBook: () => {} });
    await settle();
    const ws = FakeSocket.all[0];
    ws.authenticate();
    off1();
    expect(ws.bookMsgs.at(-1)).toEqual({ action: "subscribe_book", symbols: ["SPY"] });
    off2();
    expect(ws.bookMsgs.at(-1)).toEqual({ action: "unsubscribe_book", symbols: ["SPY"] });
    vi.advanceTimersByTime(6000);
    expect(ws.readyState).toBe(3); // nothing left: idle close
  });

  it("caps Level 2 at 5 symbols", async () => {
    const feed = makeFeed();
    for (const s of ["A", "B", "C", "D", "E", "F", "G"]) feed.subscribeBook({ symbol: s, onBook: () => {} });
    await settle();
    FakeSocket.all[0].authenticate();
    expect(FakeSocket.all[0].bookMsgs.at(-1).symbols).toHaveLength(5);
  });

  it("says unavailable only when both venues refuse, and needs-stream when the stream drops", async () => {
    const feed = makeFeed();
    const seen: Array<[BookStatus, string | undefined]> = [];
    feed.subscribeBook({ symbol: "AAPL", onBook: () => {}, onStatus: (s, msg) => seen.push([s, msg]) });
    await settle();
    const ws = FakeSocket.all[0];
    ws.authenticate();
    ws.msg({ type: "error", service: "NYSE_BOOK", message: "Not entitled" });
    expect(seen.at(-1)![0]).toBe("waiting");
    ws.msg({ type: "error", service: "NASDAQ_BOOK", message: "Not entitled" });
    expect(seen.at(-1)).toEqual(["unavailable", "Not entitled"]);
    ws.close();
    // Refusal sticks (not "needs-stream") until a fresh login.
    expect(seen.at(-1)![0]).toBe("unavailable");
    vi.advanceTimersByTime(2500);
    await settle();
    FakeSocket.all[1].authenticate();
    expect(seen.at(-1)![0]).toBe("waiting");
    FakeSocket.all[1].close();
    expect(seen.at(-1)![0]).toBe("needs-stream");
  });

  it("a late subscriber gets the current book right away", async () => {
    const feed = makeFeed();
    feed.subscribeBook({ symbol: "AAPL", onBook: () => {} });
    await settle();
    const ws = FakeSocket.all[0];
    ws.authenticate();
    ws.book("NASDAQ_BOOK", [{ key: "AAPL", 1: 1, 2: [level(190, 100)], 3: [] }]);
    const got: BookSnapshot[] = [];
    let st: BookStatus | undefined;
    feed.subscribeBook({ symbol: "AAPL", onBook: (b) => got.push(b), onStatus: (s) => (st = s) });
    expect(got).toHaveLength(1);
    expect(st).toBe("live");
  });
});
