import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { KLineData } from 'klinecharts';

interface CachedChartData {
  data: KLineData[];
  source: string;
  fetchedAt: number;
  symbol: string;
  interval: string;
}

interface ChartDataContextValue {
  // Get data from shared cache (returns null if not cached)
  getCachedData: (symbol: string, interval: string) => CachedChartData | null;
  
  // Set data in shared cache
  setCachedData: (symbol: string, interval: string, data: KLineData[], source: string) => void;
  
  // Check if data is being fetched
  isFetching: (symbol: string, interval: string) => boolean;
  
  // Mark data as being fetched (to prevent duplicate requests)
  setFetching: (symbol: string, interval: string, isFetching: boolean) => void;
  
  // Subscribe to data updates
  subscribe: (symbol: string, interval: string, callback: (data: CachedChartData) => void) => () => void;
  
  // Clear cache for a symbol/interval
  clearCache: (symbol: string, interval: string) => void;
  
  // Get cache age in seconds
  getCacheAge: (symbol: string, interval: string) => number;
}

const ChartDataContext = createContext<ChartDataContextValue | null>(null);

interface ChartDataProviderProps {
  children: ReactNode;
}

/**
 * Provider for shared chart data across multiple chart instances
 * Implements single-fetch-multiple-consumers pattern
 */
export const ChartDataProvider: React.FC<ChartDataProviderProps> = ({ children }) => {
  const [, forceUpdate] = useState({});
  
  // Cache storage
  const cacheRef = useRef<Map<string, CachedChartData>>(new Map());
  
  // Fetch status tracking
  const fetchingRef = useRef<Set<string>>(new Set());
  
  // Subscribers for reactive updates
  const subscribersRef = useRef<Map<string, Set<(data: CachedChartData) => void>>>(new Map());
  
  const getCacheKey = (symbol: string, interval: string) => `${symbol.toUpperCase()}_${interval}`;
  
  const getCachedData = useCallback((symbol: string, interval: string): CachedChartData | null => {
    const key = getCacheKey(symbol, interval);
    return cacheRef.current.get(key) || null;
  }, []);
  
  const setCachedData = useCallback((symbol: string, interval: string, data: KLineData[], source: string) => {
    const key = getCacheKey(symbol, interval);
    const cachedData: CachedChartData = {
      data,
      source,
      fetchedAt: Date.now(),
      symbol: symbol.toUpperCase(),
      interval,
    };
    
    cacheRef.current.set(key, cachedData);
    
    // Notify subscribers
    const subscribers = subscribersRef.current.get(key);
    if (subscribers) {
      subscribers.forEach(callback => callback(cachedData));
    }
    
    // Trigger re-render for components using context
    forceUpdate({});
  }, []);
  
  const isFetching = useCallback((symbol: string, interval: string): boolean => {
    const key = getCacheKey(symbol, interval);
    return fetchingRef.current.has(key);
  }, []);
  
  const setFetching = useCallback((symbol: string, interval: string, fetching: boolean) => {
    const key = getCacheKey(symbol, interval);
    if (fetching) {
      fetchingRef.current.add(key);
    } else {
      fetchingRef.current.delete(key);
    }
  }, []);
  
  const subscribe = useCallback((
    symbol: string, 
    interval: string, 
    callback: (data: CachedChartData) => void
  ): (() => void) => {
    const key = getCacheKey(symbol, interval);
    
    if (!subscribersRef.current.has(key)) {
      subscribersRef.current.set(key, new Set());
    }
    
    subscribersRef.current.get(key)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const subscribers = subscribersRef.current.get(key);
      if (subscribers) {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          subscribersRef.current.delete(key);
        }
      }
    };
  }, []);
  
  const clearCache = useCallback((symbol: string, interval: string) => {
    const key = getCacheKey(symbol, interval);
    cacheRef.current.delete(key);
  }, []);
  
  const getCacheAge = useCallback((symbol: string, interval: string): number => {
    const cached = getCachedData(symbol, interval);
    if (!cached) return Infinity;
    return Math.round((Date.now() - cached.fetchedAt) / 1000);
  }, [getCachedData]);
  
  const value: ChartDataContextValue = {
    getCachedData,
    setCachedData,
    isFetching,
    setFetching,
    subscribe,
    clearCache,
    getCacheAge,
  };
  
  return (
    <ChartDataContext.Provider value={value}>
      {children}
    </ChartDataContext.Provider>
  );
};

/**
 * Hook to access shared chart data context
 */
export const useChartData = (): ChartDataContextValue => {
  const context = useContext(ChartDataContext);
  if (!context) {
    throw new Error('useChartData must be used within a ChartDataProvider');
  }
  return context;
};

/**
 * Hook for components that optionally use shared data
 * Returns null if not within provider (for backward compatibility)
 */
export const useChartDataOptional = (): ChartDataContextValue | null => {
  return useContext(ChartDataContext);
};

export default ChartDataContext;
