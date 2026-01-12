import { useState, useCallback, useRef, useEffect } from 'react';
import { KLineData } from 'klinecharts';

interface CacheEntry {
  candles: KLineData[];
  lastFetch: number;
  source: string;
}

interface UseCandleCacheOptions {
  symbol: string;
  interval: string;
  enabled?: boolean;
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
const getCacheKey = (symbol: string, interval: string): string => {
  return `candle_cache_${symbol.toUpperCase()}_${interval}`;
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
}: UseCandleCacheOptions) => {
  const [cachedData, setCachedData] = useState<KLineData[]>([]);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<number>(0);
  const [cacheSource, setCacheSource] = useState<string>('none');
  const isCacheValidRef = useRef(false);

  const cacheKey = getCacheKey(symbol, interval);

  // Load from cache on mount or when symbol/interval changes
  useEffect(() => {
    if (!enabled) return;
    
    try {
      const stored = localStorage.getItem(cacheKey);
      if (stored) {
        const entry: CacheEntry = JSON.parse(stored);
        const expiryMs = getCacheExpiryMs(interval);
        const age = Date.now() - entry.lastFetch;
        
        if (age < expiryMs) {
          setCachedData(entry.candles);
          setLastCacheUpdate(entry.lastFetch);
          setCacheSource(entry.source);
          isCacheValidRef.current = true;
          console.log(`[CandleCache] Loaded ${entry.candles.length} cached candles for ${symbol} (${interval}), age: ${Math.round(age/1000)}s`);
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
      const entry: CacheEntry = {
        candles,
        lastFetch: Date.now(),
        source,
      };
      
      localStorage.setItem(cacheKey, JSON.stringify(entry));
      setCachedData(candles);
      setLastCacheUpdate(entry.lastFetch);
      setCacheSource(source);
      isCacheValidRef.current = true;
      
      console.log(`[CandleCache] Saved ${candles.length} candles for ${symbol} (${interval}) from ${source}`);
    } catch (error) {
      console.error('[CandleCache] Error saving cache:', error);
    }
  }, [cacheKey, enabled, symbol, interval]);

  // Update last candle in cache (for streaming updates)
  const updateLastCandle = useCallback((candle: KLineData) => {
    if (!enabled || cachedData.length === 0) return;
    
    setCachedData(prev => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      
      if (lastIdx >= 0) {
        if (updated[lastIdx].timestamp === candle.timestamp) {
          // Update existing candle
          updated[lastIdx] = candle;
        } else if (candle.timestamp > updated[lastIdx].timestamp) {
          // New candle
          updated.push(candle);
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
