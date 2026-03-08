// Shared in-memory cache for edge functions
// Reduces redundant API calls by caching market data across requests

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
}

class EdgeCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private maxEntries: number;
  private defaultTTLMs: number;

  constructor(maxEntries = 500, defaultTTLMs = 60_000) {
    this.maxEntries = maxEntries;
    this.defaultTTLMs = defaultTTLMs;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    entry.hits++;
    return entry.value;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    // Evict oldest if at capacity
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTLMs),
      hits: 0,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  stats(): { size: number; hitRate: string } {
    let totalHits = 0;
    for (const entry of this.store.values()) {
      totalHits += entry.hits;
    }
    return {
      size: this.store.size,
      hitRate: this.store.size > 0 ? `${(totalHits / this.store.size).toFixed(1)} avg hits/entry` : "0",
    };
  }

  // Prune expired entries
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        pruned++;
      }
    }
    return pruned;
  }
}

// Singleton caches for different data types
// Quotes: short TTL (30s) — prices change frequently
export const quoteCache = new EdgeCache(200, 30_000);

// Candles/historical: longer TTL (5 min) — less volatile
export const candleCache = new EdgeCache(100, 300_000);

// Options chains: medium TTL (60s)
export const optionsCache = new EdgeCache(50, 60_000);

// News/sentiment: longer TTL (10 min)
export const newsCache = new EdgeCache(50, 600_000);

// Helper: cache-through pattern
export async function cacheThrough<T>(
  cache: EdgeCache,
  key: string,
  fetchFn: () => Promise<T>,
  ttlMs?: number
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== null) {
    console.log(`[cache] HIT: ${key}`);
    return cached;
  }
  console.log(`[cache] MISS: ${key}`);
  const value = await fetchFn();
  cache.set(key, value, ttlMs);
  return value;
}
