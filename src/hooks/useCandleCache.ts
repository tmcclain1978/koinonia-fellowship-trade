import { useState, useCallback, useRef, useEffect } from 'react';
import { KLineData } from 'klinecharts';
import { safeNumber } from '@/lib/safeNumber';

const sanitizeCandle = (candle: any): KLineData | null => {
  if (!candle) return null;

  let timestamp = safeNumber(candle.timestamp ?? candle.time ?? candle.t, NaN);
  if (Number.isFinite(timestamp) && timestamp < 1e12) {
    // Convert seconds to ms if needed
    timestamp = timestamp * 1000;
  }
  if (!Number.isFinite(timestamp)) return null;

  const open = safeNumber(candle.open, NaN);
  const high = safeNumber(candle.high, NaN);
  const low = safeNumber(candle.low, NaN);
  const close = safeNumber(candle.close, NaN);
  if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
    return null;
  }

  const volumeRaw = safeNumber(candle.volume, 0);
  const volume = Number.isFinite(volumeRaw) ? volumeRaw : 0;

  return { timestamp, open, high, low, close, volume };
};

const sanitizeCandles = (candles: any[]): KLineData[] => {
  if (!Array.isArray(candles)) return [];
  return candles
    .map(sanitizeCandle)
    .filter((c): c is KLineData => Boolean(c))
    .sort((a, b) => a.timestamp - b.timestamp);
};

interface CacheEntry {
  candles: KLineData[];
  lastFetch: number;
  source: string;
}

interface UseCandleCacheOptions {
  symbol: string;
  interval: string;
  enabled?: boolean;
  includeExtendedHours?: boolean;
}

// Cache expiry times based on interval type
const getCacheExpiryMs = (interval: string): number => {
  const intervalLower = interval.toLowerCase();
  
  // Minute-level intervals expire quickly (5 minutes)
  if (intervalLower.includes('m') || intervalLower === '1' || intervalLower === '5' || 
      intervalLower === '15' || intervalLower === '30' || intervalLower === '60' ||
      intervalLower.includes('minute')) {
    return 5 * 60 * 1000; // 5 minutes
  }
  
  // Hourly intervals expire in 1 hour
  if (intervalLower === 'hour' || intervalLower.includes('h')) {
    return 60 * 60 * 1000; // 1 hour
  }
  
  // Daily/Weekly/Monthly expire in 24 hours
  return 24 * 60 * 60 * 1000; // 24 hours
};

// Generate cache key
const CACHE_KEY_PREFIX = 'candle_cache_';
const MAX_CACHED_CANDLES = 1500;

/** Save an entry; if storage is full, drop the oldest other candle caches and retry once. */
function writeCacheEntry(key: string, entry: CacheEntry) {
  const json = JSON.stringify(entry);
  try {
    localStorage.setItem(key, json);
    return;
  } catch {
    /* probably quota: evict below */
  }
  try {
    const others: Array<{ k: string; t: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(CACHE_KEY_PREFIX) || k === key) continue;
      let t = 0;
      try {
        t = JSON.parse(localStorage.getItem(k) || '{}').lastFetch || 0;
      } catch {
        /* unreadable entry: evict first */
      }
      others.push({ k, t });
    }
    others.sort((a, b) => a.t - b.t);
    others.slice(0, Math.max(1, Math.ceil(others.length / 2))).forEach(({ k }) => localStorage.removeItem(k));
    localStorage.setItem(key, json);
  } catch (error) {
    console.warn('[CandleCache] Storage full; keeping candles in memory only', error);
  }
}

const getCacheKey = (symbol: string, interval: string, includeExtendedHours: boolean): string => {
  const sessionKey = includeExtendedHours ? 'extended' : 'regular';
  return `candle_cache_${symbol.toUpperCase()}_${interval}_${sessionKey}`;
};

// Check if market is open (proper US market hours check in Eastern Time)
export const isMarketOpen = (): boolean => {
  const now = new Date();
  const day = now.getDay();
  
  // Weekend check (0 = Sunday, 6 = Saturday)
  if (day === 0 || day === 6) return false;
  
  // Get current time in Eastern timezone using proper timezone handling
  const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = easternTime.getHours();
  const minutes = easternTime.getMinutes();
  
  // Market hours: 9:30 AM - 4:00 PM ET
  const timeInMinutes = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 30;  // 9:30 AM ET
  const marketClose = 16 * 60;      // 4:00 PM ET
  
  return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
};

// Check if we're in premarket hours (4:00 AM - 9:30 AM ET)
export const isPremarket = (): boolean => {
  const now = new Date();
  const day = now.getDay();
  
  // Weekend check
  if (day === 0 || day === 6) return false;
  
  const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = easternTime.getHours();
  const minutes = easternTime.getMinutes();
  
  const timeInMinutes = hours * 60 + minutes;
  const premarketOpen = 4 * 60;     // 4:00 AM ET
  const marketOpen = 9 * 60 + 30;   // 9:30 AM ET
  
  return timeInMinutes >= premarketOpen && timeInMinutes < marketOpen;
};

// Check if we're in after hours (4:00 PM - 8:00 PM ET)
export const isAfterHours = (): boolean => {
  const now = new Date();
  const day = now.getDay();
  
  // Weekend check
  if (day === 0 || day === 6) return false;
  
  const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = easternTime.getHours();
  const minutes = easternTime.getMinutes();
  
  const timeInMinutes = hours * 60 + minutes;
  const marketClose = 16 * 60;      // 4:00 PM ET
  const afterHoursClose = 20 * 60;  // 8:00 PM ET
  
  return timeInMinutes >= marketClose && timeInMinutes < afterHoursClose;
};

// Get current Eastern Time formatted
export const getCurrentEasternTime = (): string => {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }) + ' ET';
};

// Get next market open time
export const getNextMarketOpen = (): Date => {
  const now = new Date();
  const day = now.getDay();
  
  // Get Eastern time
  const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = easternTime.getHours();
  
  // Calculate days until next trading day
  let daysToAdd = 0;
  if (day === 6) daysToAdd = 2; // Saturday -> Monday
  else if (day === 0) daysToAdd = 1; // Sunday -> Monday
  else {
    // Weekday - check if market is closed for today
    if (hours >= 16) {
      // After market close
      daysToAdd = day === 5 ? 3 : 1; // Friday -> Monday, otherwise next day
    }
  }
  
  const nextOpen = new Date(now);
  nextOpen.setDate(nextOpen.getDate() + daysToAdd);
  
  // Set to 9:30 AM ET - we need to calculate this properly
  // Create a date string in Eastern timezone and parse it
  const dateStr = nextOpen.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  const targetDate = new Date(`${dateStr} 09:30:00`);
  
  return targetDate;
};

// Get market status message
export const getMarketStatusMessage = (): string => {
  if (isMarketOpen()) {
    return 'Market Open';
  }
  
  if (isPremarket()) {
    return 'Pre-Market';
  }
  
  if (isAfterHours()) {
    return 'After Hours';
  }
  
  const now = new Date();
  const day = now.getDay();
  
  if (day === 0 || day === 6) {
    return 'Weekend - Closed';
  }
  
  return 'Market Closed';
};

export const useCandleCache = ({
  symbol,
  interval,
  enabled = true,
  includeExtendedHours = false,
}: UseCandleCacheOptions) => {
  const [cachedData, setCachedData] = useState<KLineData[]>([]);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<number>(0);
  const [cacheSource, setCacheSource] = useState<string>('none');
  const isCacheValidRef = useRef(false);

  const cacheKey = getCacheKey(symbol, interval, includeExtendedHours);

  // Load from cache on mount or when symbol/interval changes
  useEffect(() => {
    if (!enabled) return;
    
    try {
      const stored = localStorage.getItem(cacheKey);
      if (stored) {
        const entry: CacheEntry = JSON.parse(stored);
        const sanitizedCandles = sanitizeCandles(entry.candles);
        const expiryMs = getCacheExpiryMs(interval);
        const age = Date.now() - entry.lastFetch;
        
        if (age < expiryMs) {
          if (sanitizedCandles.length > 0) {
            setCachedData(sanitizedCandles);
          } else {
            // Corrupt/invalid cache; ignore it.
            isCacheValidRef.current = false;
            return;
          }
          setLastCacheUpdate(entry.lastFetch);
          setCacheSource(entry.source);
          isCacheValidRef.current = true;

          // If we had to sanitize, overwrite the stored cache to prevent recurring runtime crashes.
          if (sanitizedCandles.length !== (entry.candles?.length ?? 0)) {
            try {
              const nextEntry: CacheEntry = {
                candles: sanitizedCandles,
                lastFetch: entry.lastFetch,
                source: entry.source,
              };
              localStorage.setItem(cacheKey, JSON.stringify(nextEntry));
            } catch {
              // Ignore
            }
          }

          console.log(`[CandleCache] Loaded ${sanitizedCandles.length} cached candles for ${symbol} (${interval}), age: ${Math.round(age/1000)}s`);
        } else {
          console.log(`[CandleCache] Cache expired for ${symbol} (${interval}), age: ${Math.round(age/1000)}s`);
          isCacheValidRef.current = false;
        }
      }
    } catch (error) {
      console.error('[CandleCache] Error loading cache:', error);
    }
  }, [cacheKey, interval, enabled, symbol]);

  // Save candles to cache
  const saveToCache = useCallback((candles: KLineData[], source: string) => {
    if (!enabled || candles.length === 0) return;
    
    try {
      // Simulated data is never cached (it would later show up as "cached" real data).
      if (source === 'mock') return;
      // The cache only needs enough recent candles for an instant first paint;
      // a year of minute bars would overflow browser storage (~5 MB).
      const sanitizedCandles = sanitizeCandles(candles).slice(-MAX_CACHED_CANDLES);
      if (sanitizedCandles.length === 0) return;

      const entry: CacheEntry = {
        candles: sanitizedCandles,
        lastFetch: Date.now(),
        source,
      };

      setCachedData(sanitizedCandles);
      writeCacheEntry(cacheKey, entry);
      setLastCacheUpdate(entry.lastFetch);
      setCacheSource(source);
      isCacheValidRef.current = true;
      
      console.log(`[CandleCache] Saved ${sanitizedCandles.length} candles for ${symbol} (${interval}) from ${source}`);
    } catch (error) {
      console.error('[CandleCache] Error saving cache:', error);
    }
  }, [cacheKey, enabled, symbol, interval]);

  // Update last candle in cache (for streaming updates)
  const updateLastCandle = useCallback((candle: KLineData) => {
    if (!enabled || cachedData.length === 0) return;

    const safeCandle = sanitizeCandle(candle);
    if (!safeCandle) return;
    
    setCachedData(prev => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      
      if (lastIdx >= 0) {
        if (updated[lastIdx].timestamp === safeCandle.timestamp) {
          // Update existing candle
          updated[lastIdx] = safeCandle;
        } else if (safeCandle.timestamp > updated[lastIdx].timestamp) {
          // New candle
          updated.push(safeCandle);
        }
      }
      
      return updated;
    });
  }, [enabled, cachedData.length]);

  // Clear cache for this symbol/interval
  const clearCache = useCallback(() => {
    try {
      localStorage.removeItem(cacheKey);
      setCachedData([]);
      setLastCacheUpdate(0);
      setCacheSource('none');
      isCacheValidRef.current = false;
      console.log(`[CandleCache] Cleared cache for ${symbol} (${interval})`);
    } catch (error) {
      console.error('[CandleCache] Error clearing cache:', error);
    }
  }, [cacheKey, symbol, interval]);

  // Check if cache is valid
  const isCacheValid = useCallback((): boolean => {
    if (!enabled || cachedData.length === 0) return false;
    
    const expiryMs = getCacheExpiryMs(interval);
    const age = Date.now() - lastCacheUpdate;
    
    return age < expiryMs;
  }, [enabled, cachedData.length, interval, lastCacheUpdate]);

  // Get cache age in seconds
  const getCacheAge = useCallback((): number => {
    if (lastCacheUpdate === 0) return Infinity;
    return Math.round((Date.now() - lastCacheUpdate) / 1000);
  }, [lastCacheUpdate]);

  return {
    cachedData,
    cacheSource,
    lastCacheUpdate,
    saveToCache,
    updateLastCandle,
    clearCache,
    isCacheValid,
    getCacheAge,
    isMarketOpen,
    getMarketStatusMessage,
    getNextMarketOpen,
  };
};
