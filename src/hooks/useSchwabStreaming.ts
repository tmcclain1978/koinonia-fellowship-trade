import { useState, useEffect, useCallback, useRef } from "react";
import { schwabFeed, type StreamingQuote, type FeedStatus, type AccountActivityItem } from "@/lib/marketData";

export type { StreamingQuote } from "@/lib/marketData";

export type AccountActivity = AccountActivityItem;

// Price update callback for chart integration
export interface SchwabPriceUpdate {
  symbol: string;
  price: number;
  high: number;
  low: number;
  /** Cumulative volume for the day (not the size of one trade). */
  volume: number;
  bid: number;
  ask: number;
  change: number;
  changePercent: number;
  timestamp: Date;
  direction: 'up' | 'down' | 'unchanged';
  /** Epoch ms of the last trade, when the stream provides it. */
  tradeTime?: number;
  /** False for fallback quotes (delayed or previous close). Charts ignore these. */
  isLive: boolean;
}

interface UseSchwabStreamingOptions {
  symbols: string[];
  /** Polling interval in ms when streaming is unavailable (shared poll uses the smallest requested). */
  refreshInterval?: number;
  enabled?: boolean;
  /** Whether this component wants live streaming (false = polling only). */
  useWebSocket?: boolean;
  subscribeToAccountActivity?: boolean;
  onPriceUpdate?: (update: SchwabPriceUpdate) => void;
}

type StreamingStatus = 'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'error' | 'polling';

const toStreamingStatus = (s: FeedStatus): StreamingStatus =>
  s === 'streaming' ? 'authenticated' : s === 'idle' ? 'disconnected' : s;

export const toPriceUpdate = (q: StreamingQuote): SchwabPriceUpdate => ({
  symbol: q.symbol,
  price: q.lastPrice,
  high: q.highPrice ?? q.lastPrice,
  low: q.lowPrice ?? q.lastPrice,
  volume: q.volume ?? 0,
  bid: q.bidPrice ?? q.lastPrice,
  ask: q.askPrice ?? q.lastPrice,
  change: q.netChange ?? 0,
  changePercent: q.netPercentChange ?? 0,
  timestamp: q.lastUpdated,
  direction: q.priceDirection ?? 'unchanged',
  tradeTime: q.tradeTime,
  isLive: q.isLive,
});

/**
 * Live quotes for a set of symbols. All components share one connection
 * (see src/lib/marketData/schwabFeed.ts); this hook only subscribes to it.
 */
export const useSchwabStreaming = ({
  symbols,
  refreshInterval = 15000,
  enabled = true,
  useWebSocket = true,
  subscribeToAccountActivity = false,
  onPriceUpdate,
}: UseSchwabStreamingOptions) => {
  const [quotes, setQuotes] = useState<Map<string, StreamingQuote>>(new Map());
  const [accountActivity, setAccountActivity] = useState<AccountActivity[]>([]);
  const [feedStatus, setFeedStatus] = useState<FeedStatus>(schwabFeed.getStatus());
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [paused, setPaused] = useState(false);

  const onPriceUpdateRef = useRef(onPriceUpdate);
  onPriceUpdateRef.current = onPriceUpdate;

  const symbolsKey = symbols.map((s) => s.trim().toUpperCase()).filter(Boolean).sort().join(',');
  const active = enabled && !paused && symbolsKey.length > 0;

  useEffect(() => schwabFeed.onStatus(setFeedStatus), []);

  useEffect(() => {
    if (!active) return;
    const list = symbolsKey.split(',');

    // Seed with whatever the feed already has for these symbols.
    const seeded = new Map<string, StreamingQuote>();
    for (const s of list) {
      const q = schwabFeed.getQuote(s);
      if (q) seeded.set(s, q);
    }
    setQuotes(seeded);

    // Batch React state updates (quotes can arrive many times per second);
    // the chart callback still fires for every update.
    const pending = new Map<string, StreamingQuote>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      flushTimer = null;
      if (pending.size === 0) return;
      const batch = new Map(pending);
      pending.clear();
      setQuotes((prev) => {
        const next = new Map(prev);
        batch.forEach((q, s) => next.set(s, q));
        return next;
      });
      setLastUpdate(new Date());
    };

    const unsubscribe = schwabFeed.subscribe({
      symbols: list,
      pollMs: refreshInterval,
      useWebSocket,
      onQuote: (q) => {
        onPriceUpdateRef.current?.(toPriceUpdate(q));
        pending.set(q.symbol, q);
        if (!flushTimer) flushTimer = setTimeout(flush, 100);
      },
    });

    return () => {
      unsubscribe();
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [active, symbolsKey, refreshInterval, useWebSocket]);

  useEffect(() => {
    if (!subscribeToAccountActivity || !enabled) return;
    return schwabFeed.onAccountActivity((items) =>
      setAccountActivity((prev) => [...items, ...prev].slice(0, 100)),
    );
  }, [subscribeToAccountActivity, enabled]);

  const getQuote = useCallback(
    (symbol: string): StreamingQuote | undefined => quotes.get(symbol.toUpperCase()) ?? schwabFeed.getQuote(symbol),
    [quotes],
  );

  const refresh = useCallback(() => {
    void schwabFeed.pollNow(symbolsKey ? symbolsKey.split(',') : []);
  }, [symbolsKey]);

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  const status: StreamingStatus = active ? toStreamingStatus(feedStatus) : 'disconnected';
  const isConnected = active && (feedStatus === 'streaming' || (feedStatus === 'polling' && lastUpdate !== null));

  return {
    quotes,
    getQuote,
    accountActivity,
    status,
    isConnected,
    error: feedStatus === 'error' ? 'Streaming unavailable' : null,
    lastUpdate,
    refresh,
    pause,
    resume,
  };
};
