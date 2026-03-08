// Global WebSocket Connection Manager
// Implements fan-out architecture: one connection serves many subscribers
// Prevents duplicate connections to the same data source

import { StreamingPrice } from "@/hooks/useMarketDataStream";

type PriceCallback = (price: StreamingPrice) => void;
type ConnectionCallback = (connected: boolean) => void;

interface Subscription {
  id: string;
  symbols: Set<string>;
  onPrice: PriceCallback;
  onConnection?: ConnectionCallback;
}

interface ConnectionState {
  connected: boolean;
  lastHeartbeat: number;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  reconnectDelayMs: number;
}

class WebSocketConnectionManager {
  private subscriptions = new Map<string, Subscription>();
  private allSymbols = new Set<string>();
  private priceCache = new Map<string, StreamingPrice>();
  private connectionState: ConnectionState = {
    connected: false,
    lastHeartbeat: 0,
    reconnectAttempts: 0,
    maxReconnectAttempts: 10,
    reconnectDelayMs: 1000,
  };
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  
  // Metrics
  private metrics = {
    messagesReceived: 0,
    messagesFanOut: 0,
    cacheHits: 0,
    reconnects: 0,
    startedAt: Date.now(),
  };

  constructor() {
    this.startHealthCheck();
    this.startMetricsCollection();
  }

  /**
   * Subscribe to price updates for given symbols.
   * Returns an unsubscribe function.
   */
  subscribe(
    symbols: string[],
    onPrice: PriceCallback,
    onConnection?: ConnectionCallback
  ): () => void {
    const id = crypto.randomUUID();
    const symbolSet = new Set(symbols.map((s) => s.toUpperCase()));

    this.subscriptions.set(id, { id, symbols: symbolSet, onPrice, onConnection });

    // Merge into global symbol set
    for (const sym of symbolSet) {
      this.allSymbols.add(sym);
    }

    // Immediately send cached prices
    for (const sym of symbolSet) {
      const cached = this.priceCache.get(sym);
      if (cached) {
        this.metrics.cacheHits++;
        onPrice(cached);
      }
    }

    // Notify connection state
    onConnection?.(this.connectionState.connected);

    return () => {
      this.subscriptions.delete(id);
      this.recalculateSymbols();
    };
  }

  /**
   * Push a price update from any source (WebSocket, REST poll, etc.)
   * Fans out to all subscribers watching this symbol.
   */
  pushPrice(price: StreamingPrice): void {
    this.metrics.messagesReceived++;
    const sym = price.symbol.toUpperCase();

    // Update cache
    this.priceCache.set(sym, price);

    // Fan out to subscribers
    for (const sub of this.subscriptions.values()) {
      if (sub.symbols.has(sym)) {
        this.metrics.messagesFanOut++;
        try {
          sub.onPrice(price);
        } catch (e) {
          console.error(`[WSManager] Error in subscriber callback:`, e);
        }
      }
    }
  }

  /**
   * Update connection state and notify all subscribers.
   */
  setConnected(connected: boolean): void {
    const changed = this.connectionState.connected !== connected;
    this.connectionState.connected = connected;

    if (connected) {
      this.connectionState.lastHeartbeat = Date.now();
      this.connectionState.reconnectAttempts = 0;
    }

    if (changed) {
      for (const sub of this.subscriptions.values()) {
        sub.onConnection?.(connected);
      }
    }
  }

  /**
   * Record a heartbeat (keep-alive).
   */
  heartbeat(): void {
    this.connectionState.lastHeartbeat = Date.now();
  }

  /**
   * Get the current price for a symbol from cache.
   */
  getCachedPrice(symbol: string): StreamingPrice | undefined {
    return this.priceCache.get(symbol.toUpperCase());
  }

  /**
   * Get all currently subscribed symbols.
   */
  getActiveSymbols(): string[] {
    return Array.from(this.allSymbols);
  }

  /**
   * Get subscriber count.
   */
  getSubscriberCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Get connection health info.
   */
  getHealth(): {
    connected: boolean;
    subscriberCount: number;
    symbolCount: number;
    cachedPrices: number;
    lastHeartbeatAge: number;
    metrics: typeof this.metrics;
  } {
    return {
      connected: this.connectionState.connected,
      subscriberCount: this.subscriptions.size,
      symbolCount: this.allSymbols.size,
      cachedPrices: this.priceCache.size,
      lastHeartbeatAge: Date.now() - this.connectionState.lastHeartbeat,
      metrics: { ...this.metrics },
    };
  }

  /**
   * Should we attempt reconnection?
   */
  shouldReconnect(): boolean {
    return (
      !this.connectionState.connected &&
      this.connectionState.reconnectAttempts < this.connectionState.maxReconnectAttempts &&
      this.subscriptions.size > 0
    );
  }

  /**
   * Record a reconnect attempt.
   */
  recordReconnect(): number {
    this.connectionState.reconnectAttempts++;
    this.metrics.reconnects++;
    // Exponential backoff with jitter
    const delay = Math.min(
      this.connectionState.reconnectDelayMs * Math.pow(2, this.connectionState.reconnectAttempts - 1),
      30000
    ) + Math.random() * 1000;
    return delay;
  }

  private recalculateSymbols(): void {
    this.allSymbols.clear();
    for (const sub of this.subscriptions.values()) {
      for (const sym of sub.symbols) {
        this.allSymbols.add(sym);
      }
    }
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      // If connected but no heartbeat in 30s, mark as disconnected
      if (
        this.connectionState.connected &&
        this.connectionState.lastHeartbeat > 0 &&
        Date.now() - this.connectionState.lastHeartbeat > 30_000
      ) {
        console.warn("[WSManager] Connection stale, marking disconnected");
        this.setConnected(false);
      }
    }, 10_000);
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      const health = this.getHealth();
      if (health.subscriberCount > 0) {
        console.debug(
          `[WSManager] Subs: ${health.subscriberCount}, Syms: ${health.symbolCount}, Cache: ${health.cachedPrices}, Msgs: ${health.metrics.messagesReceived}, FanOut: ${health.metrics.messagesFanOut}`
        );
      }
    }, 60_000);
  }

  destroy(): void {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    if (this.metricsInterval) clearInterval(this.metricsInterval);
    this.subscriptions.clear();
    this.priceCache.clear();
    this.allSymbols.clear();
  }
}

// Singleton instance
export const wsManager = new WebSocketConnectionManager();
