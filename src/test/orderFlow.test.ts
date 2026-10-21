import { describe, it, expect, vi, afterEach } from "vitest";
import { BookHistory, PrintLog, TradeClassifier, cumulativeDelta, footprintRowSize, percentile, priceStep } from "@/components/charts/orderflow/flow";
import { OrderFlowRecorder, acquireOrderFlow, peekOrderFlow, resetOrderFlowRecorders, type FeedLike } from "@/components/charts/orderflow/recorder";
import type { BookSubscription, FeedStatus, QuoteSubscription, StreamingQuote } from "@/lib/marketData/schwabFeed";

describe("classing trades as bought or sold", () => {
  it("uses the quote before the trade: at the ask = buy, at the bid = sell", () => {
    const c = new TradeClassifier();
    expect(c.push({ price: 10, bid: 9.99, ask: 10.01, volume: 1000 }, 0)).toBeNull(); // baseline
    expect(c.push({ price: 10.01, bid: 10, ask: 10.02, volume: 1300, time: 5 }, 1)).toEqual({ time: 5, price: 10.01, size: 300, side: "buy" });
    expect(c.push({ price: 10, bid: 10, ask: 10.02, volume: 1400 }, 2)).toMatchObject({ size: 100, side: "sell" });
  });

  it("between bid and ask: nearer side, then the tick rule", () => {
    const c = new TradeClassifier();
    c.push({ price: 10, bid: 9.9, ask: 10.1, volume: 0 }, 0);
    expect(c.push({ price: 10.07, volume: 100 }, 1)!.side).toBe("buy"); // above mid
    expect(c.push({ price: 9.95, volume: 200 }, 2)!.side).toBe("sell"); // below mid
    // exactly mid: tick rule vs last different price (9.95) -> up = buy
    expect(c.push({ price: 10, volume: 300 }, 3)!.side).toBe("buy");
    // same price again: keeps last direction
    expect(c.push({ price: 10, volume: 350 }, 4)!.side).toBe("buy");
  });

  it("quote-only updates make no trade but refresh the quote", () => {
    const c = new TradeClassifier();
    c.push({ price: 10, bid: 9.99, ask: 10.01, volume: 100 }, 0);
    expect(c.push({ price: 10, bid: 10.05, ask: 10.07, volume: 100 }, 1)).toBeNull();
    expect(c.push({ price: 10.05, volume: 150 }, 2)!.side).toBe("sell"); // at the new bid
  });

  it("volume after a stream break is unknown (never a fake buy or sell)", () => {
    const c = new TradeClassifier();
    c.push({ price: 10, bid: 9.99, ask: 10.01, volume: 100 }, 0);
    c.markGap();
    expect(c.push({ price: 10.01, volume: 50_100 }, 1)!.side).toBe("unknown");
    expect(c.push({ price: 10.01, volume: 50_200 }, 2)!.side).toBe("buy"); // back to normal
    // long silence also counts as a break
    expect(c.push({ price: 10.01, volume: 50_300 }, 2 + 61_000)!.side).toBe("unknown");
  });

  it("a day-volume reset starts a new baseline", () => {
    const c = new TradeClassifier();
    c.push({ price: 10, volume: 5_000_000 }, 0);
    expect(c.push({ price: 10, volume: 200 }, 1)).toBeNull();
    expect(c.push({ price: 10.2, bid: 10, ask: 10.2, volume: 300 }, 2)!.size).toBe(100);
  });
});

describe("print log", () => {
  const log = () => {
    const l = new PrintLog();
    l.add({ time: 1_000, price: 10, size: 100, side: "buy" });
    l.add({ time: 1_500, price: 10.01, size: 40, side: "sell" });
    l.add({ time: 2_100, price: 10.02, size: 70, side: "buy" });
    l.add({ time: 2_200, price: 10.02, size: 1000, side: "unknown" });
    l.add({ time: 3_500, price: 10, size: 25, side: "sell" });
    return l;
  };

  it("adds up flow per bar; bars before recording are null", () => {
    const f = log().barFlows([0, 1_000, 2_000, 3_000]);
    expect(f[0]).toBeNull();
    expect(f[1]).toEqual({ buy: 100, sell: 40, unknown: 0, delta: 60 });
    expect(f[2]).toEqual({ buy: 70, sell: 0, unknown: 1000, delta: 70 });
    expect(f[3]).toEqual({ buy: 0, sell: 25, unknown: 0, delta: -25 });
    expect(cumulativeDelta([null, ...f.slice(1), null])).toEqual([null, 60, 130, 105, 105]);
  });

  it("footprint rows and session volume at price", () => {
    const l = log();
    expect(l.footprint(1_000, 4_000, 0.01)).toEqual([
      { price: 10.02, buy: 70, sell: 0 },
      { price: 10.01, buy: 0, sell: 40 },
      { price: 10, buy: 100, sell: 25 },
    ]);
    expect(l.footprint(1_000, 4_000, 0.05)).toEqual([{ price: 10, buy: 170, sell: 65 }]);
    expect(l.volumeAt(10)).toEqual({ buy: 100, sell: 25 });
  });

  it("keeps time order", () => {
    const l = new PrintLog();
    l.add({ time: 5, price: 1, size: 1, side: "buy" });
    l.add({ time: 3, price: 1, size: 1, side: "buy" });
    expect(l.prints.map((p) => p.time)).toEqual([5, 5]);
  });
});

describe("book history", () => {
  it("one frame per second (latest wins) and range lookup", () => {
    const h = new BookHistory();
    h.add(1_000, [{ price: 10, size: 1 }], []);
    h.add(1_400, [{ price: 10, size: 2 }], []);
    h.add(2_000, [{ price: 10, size: 3 }], [{ price: 10.01, size: 9 }]);
    h.add(5_000, [{ price: 10, size: 4 }], []);
    expect(h.frames.map((f) => [f.time, f.bids[1]])).toEqual([[1_000, 2], [2_000, 3], [5_000, 4]]);
    // range includes the frame in force at the start
    expect(h.range(2_500, 6_000).map((f) => f.time)).toEqual([2_000, 5_000]);
    expect(priceStep(h.frames[1])).toBe(0.01);
  });

  it("helpers", () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(footprintRowSize(1200)).toBe(0.01); // 12 px per cent
    expect(footprintRowSize(100)).toBe(0.25);
  });
});

/* ---- recorder ------------------------------------------------------------ */

function fakeFeed() {
  let status: FeedStatus = "streaming";
  const quoteSubs: QuoteSubscription[] = [];
  const bookSubs: BookSubscription[] = [];
  const statusL = new Set<(s: FeedStatus) => void>();
  const feed: FeedLike = {
    subscribe: (s) => { quoteSubs.push(s); return () => quoteSubs.splice(quoteSubs.indexOf(s), 1); },
    subscribeBook: (s) => { bookSubs.push(s); return () => bookSubs.splice(bookSubs.indexOf(s), 1); },
    onStatus: (l) => { statusL.add(l); return () => statusL.delete(l); },
    getStatus: () => status,
  };
  const quote = (q: Partial<StreamingQuote>) => quoteSubs.forEach((s) => s.onQuote({ symbol: "AAPL", isLive: true, viaStream: true, lastUpdated: new Date(), ...q } as StreamingQuote));
  return { feed, quoteSubs, bookSubs, quote, setStatus: (s: FeedStatus) => { status = s; statusL.forEach((l) => l(s)); } };
}

afterEach(() => { resetOrderFlowRecorders(); vi.useRealTimers(); });

describe("order flow recorder", () => {
  it("records classed trades and book frames, and notifies (throttled)", () => {
    vi.useFakeTimers();
    const f = fakeFeed();
    let t = 1_000_000;
    const rec = new OrderFlowRecorder("AAPL", f.feed, () => t);
    const cb = vi.fn();
    rec.onChange(cb);
    rec.start();
    f.quote({ lastPrice: 10, bidPrice: 9.99, askPrice: 10.01, volume: 100 });
    t += 500;
    f.quote({ lastPrice: 10.01, volume: 400, tradeTime: t });
    f.bookSubs[0].onBook({ symbol: "AAPL", time: t, bids: [{ price: 10, size: 500, venues: 1 }], asks: [{ price: 10.01, size: 200, venues: 1 }] });
    expect(rec.prints.prints).toEqual([{ time: t, price: 10.01, size: 300, side: "buy" }]);
    expect(rec.book.frames).toHaveLength(1);
    expect(rec.latestBook?.bids[0].size).toBe(500);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("ignores fallback quotes and doesn't class volume while only polling", () => {
    const f = fakeFeed();
    const rec = new OrderFlowRecorder("AAPL", f.feed, () => 0);
    rec.start();
    f.quote({ lastPrice: 10, bidPrice: 9.99, askPrice: 10.01, volume: 100 });
    f.quote({ lastPrice: 11, volume: 900, isLive: false });
    f.quote({ lastPrice: 12, volume: 50, viaStream: false }); // REST refresh: price only
    f.setStatus("polling");
    f.quote({ lastPrice: 10.01, volume: 500 });
    expect(rec.prints.prints.map((p) => p.side)).toEqual(["unknown"]);
    f.setStatus("streaming");
    f.quote({ lastPrice: 10.01, bidPrice: 10, askPrice: 10.01, volume: 600 });
    f.quote({ lastPrice: 10.01, volume: 700 });
    expect(rec.prints.prints.map((p) => p.side)).toEqual(["unknown", "unknown", "buy"]);
  });

  it("one shared recorder per symbol, kept for a while after the last chart closes", () => {
    vi.useFakeTimers();
    const f = fakeFeed();
    const a = acquireOrderFlow("aapl", f.feed)!;
    const b = acquireOrderFlow("AAPL", f.feed)!;
    expect(a.rec).toBe(b.rec);
    expect(f.quoteSubs).toHaveLength(1);
    a.release();
    b.release();
    expect(peekOrderFlow("AAPL")).toBe(a.rec);
    vi.advanceTimersByTime(60_000);
    const c = acquireOrderFlow("AAPL", f.feed)!; // back within the window: same data
    expect(c.rec).toBe(a.rec);
    c.release();
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(peekOrderFlow("AAPL")).toBeNull();
    expect(f.quoteSubs).toHaveLength(0);
    expect(f.bookSubs).toHaveLength(0);
  });

  it("stops right away when the user turns order flow off", () => {
    const f = fakeFeed();
    const a = acquireOrderFlow("SPY", f.feed)!;
    a.release(true);
    expect(peekOrderFlow("SPY")).toBeNull();
    expect(f.bookSubs).toHaveLength(0);
  });
});
