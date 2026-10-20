import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SchwabFeed, mergeLevelOne, LEVEL_ONE_FIELDS, type WebSocketLike, type StreamingQuote } from "@/lib/marketData/schwabFeed";
import type { SchwabQuote } from "@/lib/schwabApi";

class FakeSocket implements WebSocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: any[] = [];
  closed = false;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  constructor(public url: string, public protocols: string[]) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.({});
  }
  // test helpers
  authenticate() {
    this.readyState = 1;
    this.onopen?.({});
    this.onmessage?.({ data: JSON.stringify({ type: "connected" }) });
  }
  push(content: Record<string, unknown>[]) {
    this.onmessage?.({ data: JSON.stringify({ type: "data", service: "LEVELONE_EQUITIES", content }) });
  }
  dropConnection() {
    this.readyState = 3;
    this.onclose?.({});
  }
  get subscriptions() {
    return this.sent.filter((m) => m.action === "subscribe");
  }
}

const restQuote = (symbol: string, lastPrice: number, extra: Partial<SchwabQuote> = {}): SchwabQuote => ({ symbol, lastPrice, ...extra });

function makeFeed(fetchQuotes = vi.fn(async (symbols: string[]) => symbols.map((s) => restQuote(s, 100)))) {
  const feed = new SchwabFeed({
    streamUrl: "wss://example/functions/v1/schwab-streaming",
    createSocket: (url, protocols) => new FakeSocket(url, protocols),
    getAccessToken: async () => "token-123",
    fetchQuotes,
  });
  return { feed, fetchQuotes };
}

/** Let pending promises (token lookup, polls) resolve. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("mergeLevelOne", () => {
  it("uses Schwab's field numbers (3 = last, 1 = bid, 2 = ask, 10/11 = high/low)", () => {
    const q = mergeLevelOne(undefined, { key: "AAPL", 1: 189.9, 2: 190.1, 3: 190.0, 8: 1_000_000, 10: 191, 11: 188, 12: 187.5, 13: "Q" }, 0)!;
    expect(q.lastPrice).toBe(190.0);
    expect(q.bidPrice).toBe(189.9);
    expect(q.askPrice).toBe(190.1);
    expect(q.highPrice).toBe(191);
    expect(q.lowPrice).toBe(188);
    expect(q.closePrice).toBe(187.5);
    expect(q.volume).toBe(1_000_000);
    expect(q.netChange).toBeCloseTo(2.5);
    expect(q.isLive).toBe(true);
  });

  it("keeps earlier values when an update only contains the fields that changed", () => {
    const first = mergeLevelOne(undefined, { key: "AAPL", 1: 189.9, 2: 190.1, 3: 190, 8: 1_000_000, 10: 191, 11: 188, 12: 187.5 }, 0)!;
    const next = mergeLevelOne(first, { key: "AAPL", 3: 190.25 }, 1)!;
    expect(next.lastPrice).toBe(190.25);
    expect(next.volume).toBe(1_000_000); // used to become 0
    expect(next.lowPrice).toBe(188); // used to become the exchange code
    expect(next.priceDirection).toBe("up");
    expect(next.netChange).toBeCloseTo(2.75);
  });

  it("ignores a first update with no last price", () => {
    expect(mergeLevelOne(undefined, { key: "AAPL", 1: 189.9 }, 0)).toBeNull();
  });
});

describe("SchwabFeed", () => {
  it("opens ONE connection for many subscribers and subscribes to the union of symbols", async () => {
    const { feed } = makeFeed();
    feed.subscribe({ symbols: ["AAPL"], onQuote: () => {} });
    feed.subscribe({ symbols: ["MSFT", "aapl"], onQuote: () => {} });
    feed.subscribe({ symbols: ["TSLA"], onQuote: () => {} });
    await settle();
    expect(FakeSocket.all).toHaveLength(1);

    const ws = FakeSocket.all[0];
    ws.authenticate();
    await settle();
    const last = ws.subscriptions.at(-1);
    expect(last).toMatchObject({ service: "LEVELONE_EQUITIES", symbols: ["AAPL", "MSFT", "TSLA"], fields: LEVEL_ONE_FIELDS });
    expect(feed.getStatus()).toBe("streaming");
    feed.dispose();
  });

  it("updates the subscription when a component leaves, and closes the socket when the last one does", async () => {
    const { feed } = makeFeed();
    const offA = feed.subscribe({ symbols: ["AAPL"], onQuote: () => {} });
    const offB = feed.subscribe({ symbols: ["MSFT"], onQuote: () => {} });
    await settle();
    const ws = FakeSocket.all[0];
    ws.authenticate();
    await settle();

    offA();
    expect(ws.subscriptions.at(-1).symbols).toEqual(["MSFT"]);

    offB();
    expect(ws.closed).toBe(false); // short grace period for remounts
    vi.advanceTimersByTime(5_000);
    expect(ws.closed).toBe(true);
    expect(feed.getStatus()).toBe("idle");
  });

  it("routes each quote only to subscribers of that symbol", async () => {
    const { feed } = makeFeed();
    const aapl: StreamingQuote[] = [];
    const msft: StreamingQuote[] = [];
    feed.subscribe({ symbols: ["AAPL"], onQuote: (q) => aapl.push(q) });
    feed.subscribe({ symbols: ["MSFT"], onQuote: (q) => msft.push(q) });
    await settle();
    const ws = FakeSocket.all[0];
    ws.authenticate();
    await settle();
    aapl.length = 0;
    msft.length = 0;

    ws.push([{ key: "AAPL", 3: 191 }]);
    expect(aapl.map((q) => q.lastPrice)).toEqual([191]);
    expect(msft).toHaveLength(0);
    feed.dispose();
  });

  it("polls (once for everyone) until streaming connects, then stops polling", async () => {
    const { feed, fetchQuotes } = makeFeed();
    feed.subscribe({ symbols: ["AAPL"], pollMs: 2_000, onQuote: () => {} });
    feed.subscribe({ symbols: ["MSFT"], pollMs: 15_000, onQuote: () => {} });
    await settle();
    expect(fetchQuotes).toHaveBeenCalledWith(["AAPL", "MSFT"]);

    const callsBefore = fetchQuotes.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchQuotes.mock.calls.length).toBe(callsBefore + 1);

    FakeSocket.all[0].authenticate();
    await settle();
    const afterConnect = fetchQuotes.mock.calls.length; // one REST snapshot on connect
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchQuotes.mock.calls.length).toBe(afterConnect);
    feed.dispose();
  });

  it("fetches a late subscriber's symbol right away instead of waiting for the next poll", async () => {
    const { feed, fetchQuotes } = makeFeed();
    feed.subscribe({ symbols: ["AAPL"], pollMs: 15_000, onQuote: () => {} });
    await settle();
    const got: StreamingQuote[] = [];
    feed.subscribe({ symbols: ["NVDA"], onQuote: (q) => got.push(q) });
    await settle();
    expect(fetchQuotes).toHaveBeenLastCalledWith(["NVDA"]);
    expect(got[0]?.symbol).toBe("NVDA");
    feed.dispose();
  });

  it("falls back to polling and reconnects when the stream drops", async () => {
    const { feed, fetchQuotes } = makeFeed();
    feed.subscribe({ symbols: ["AAPL"], pollMs: 2_000, onQuote: () => {} });
    await settle();
    FakeSocket.all[0].authenticate();
    await settle();

    FakeSocket.all[0].dropConnection();
    expect(feed.getStatus()).toBe("polling");
    const calls = fetchQuotes.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchQuotes.mock.calls.length).toBeGreaterThan(calls);
    expect(FakeSocket.all).toHaveLength(2); // reconnected
    feed.dispose();
  });

  it("marks fallback quotes as not live and never lets them replace a recent live quote", async () => {
    let restReply: SchwabQuote[] = [];
    const { feed } = makeFeed(vi.fn(async () => restReply));
    const seen: StreamingQuote[] = [];
    feed.subscribe({ symbols: ["AAPL"], onQuote: (q) => seen.push(q) });
    await settle();
    FakeSocket.all[0].authenticate();
    await settle();
    FakeSocket.all[0].push([{ key: "AAPL", 3: 190, 8: 5_000 }]);

    restReply = [restQuote("AAPL", 185, { source: "polygon-fallback", isPreviousClose: true })];
    await feed.pollNow(["AAPL"]);
    expect(feed.getQuote("AAPL")!.lastPrice).toBe(190);
    expect(seen.at(-1)!.isLive).toBe(true);
    feed.dispose();
  });

  it("treats quotes without a source as live Schwab data", async () => {
    const { feed } = makeFeed(vi.fn(async () => [restQuote("AAPL", 190)]));
    const seen: StreamingQuote[] = [];
    feed.subscribe({ symbols: ["AAPL"], useWebSocket: false, onQuote: (q) => seen.push(q) });
    await settle();
    expect(FakeSocket.all).toHaveLength(0); // polling-only subscriber doesn't open a socket
    expect(seen[0].isLive).toBe(true);
    feed.dispose();
  });
});
