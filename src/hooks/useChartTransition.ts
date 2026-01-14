import { useState, useCallback, useRef, useEffect } from 'react';
import { KLineData } from 'klinecharts';

interface ChartState {
  symbol: string;
  interval: string;
  zoomLevel: number;
  scrollPosition: number;
}

interface UseChartTransitionOptions {
  symbol: string;
  interval: string;
  onTransitionStart?: () => void;
  onTransitionEnd?: () => void;
}

interface PendingTransition {
  symbol: string;
  interval: string;
  timestamp: number;
}

/**
 * Hook to manage atomic symbol/interval transitions
 * Prevents race conditions by queuing changes and processing sequentially
 */
export const useChartTransition = ({
  symbol,
  interval,
  onTransitionStart,
  onTransitionEnd,
}: UseChartTransitionOptions) => {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [previousState, setPreviousState] = useState<ChartState | null>(null);
  
  // Queue for pending transitions
  const transitionQueueRef = useRef<PendingTransition[]>([]);
  const isProcessingRef = useRef(false);
  const currentSymbolRef = useRef(symbol);
  const currentIntervalRef = useRef(interval);
  
  // Store per-symbol chart state for restoration
  const chartStateCache = useRef<Map<string, ChartState>>(new Map());
  
  // Prefetch cache for anticipated data
  const prefetchCacheRef = useRef<Map<string, KLineData[]>>(new Map());

  /**
   * Save current chart state before transition
   */
  const saveChartState = useCallback((
    chartSymbol: string,
    zoomLevel: number,
    scrollPosition: number
  ) => {
    const state: ChartState = {
      symbol: chartSymbol,
      interval: currentIntervalRef.current,
      zoomLevel,
      scrollPosition,
    };
    chartStateCache.current.set(chartSymbol, state);
    
    // Also persist to localStorage for session continuity
    try {
      const stored = localStorage.getItem('chart-state-cache');
      const cache = stored ? JSON.parse(stored) : {};
      cache[chartSymbol] = state;
      localStorage.setItem('chart-state-cache', JSON.stringify(cache));
    } catch (e) {
      // Ignore storage errors
    }
  }, []);

  /**
   * Restore chart state after transition
   */
  const getChartState = useCallback((chartSymbol: string): ChartState | null => {
    // Check memory cache first
    const memoryState = chartStateCache.current.get(chartSymbol);
    if (memoryState) return memoryState;
    
    // Fall back to localStorage
    try {
      const stored = localStorage.getItem('chart-state-cache');
      if (stored) {
        const cache = JSON.parse(stored);
        return cache[chartSymbol] || null;
      }
    } catch (e) {
      // Ignore storage errors
    }
    return null;
  }, []);

  /**
   * Prefetch data for an interval (called on hover)
   */
  const prefetchInterval = useCallback(async (
    targetInterval: string,
    fetchFn: (interval: string) => Promise<KLineData[]>
  ) => {
    const cacheKey = `${symbol}_${targetInterval}`;
    
    // Don't prefetch if already cached
    if (prefetchCacheRef.current.has(cacheKey)) return;
    
    try {
      const data = await fetchFn(targetInterval);
      prefetchCacheRef.current.set(cacheKey, data);
      console.log(`[ChartTransition] Prefetched ${data.length} candles for ${targetInterval}`);
    } catch (error) {
      console.warn(`[ChartTransition] Prefetch failed for ${targetInterval}:`, error);
    }
  }, [symbol]);

  /**
   * Get prefetched data if available
   */
  const getPrefetchedData = useCallback((targetInterval: string): KLineData[] | null => {
    const cacheKey = `${symbol}_${targetInterval}`;
    return prefetchCacheRef.current.get(cacheKey) || null;
  }, [symbol]);

  /**
   * Clear prefetch cache for current symbol
   */
  const clearPrefetchCache = useCallback(() => {
    const keysToRemove: string[] = [];
    prefetchCacheRef.current.forEach((_, key) => {
      if (key.startsWith(`${symbol}_`)) {
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach(key => prefetchCacheRef.current.delete(key));
  }, [symbol]);

  /**
   * Process the transition queue
   */
  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    
    const nextTransition = transitionQueueRef.current.shift();
    if (!nextTransition) return;
    
    isProcessingRef.current = true;
    setIsTransitioning(true);
    setTransitionProgress(0);
    onTransitionStart?.();
    
    try {
      // Animate progress
      const progressInterval = setInterval(() => {
        setTransitionProgress(prev => Math.min(prev + 10, 90));
      }, 50);
      
      // Store previous state for potential rollback
      setPreviousState({
        symbol: currentSymbolRef.current,
        interval: currentIntervalRef.current,
        zoomLevel: 1,
        scrollPosition: 0,
      });
      
      // Update current refs
      currentSymbolRef.current = nextTransition.symbol;
      currentIntervalRef.current = nextTransition.interval;
      
      // Complete progress
      clearInterval(progressInterval);
      setTransitionProgress(100);
      
      // Brief delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } finally {
      setIsTransitioning(false);
      setTransitionProgress(0);
      isProcessingRef.current = false;
      onTransitionEnd?.();
      
      // Process next in queue if any
      if (transitionQueueRef.current.length > 0) {
        processQueue();
      }
    }
  }, [onTransitionStart, onTransitionEnd]);

  /**
   * Queue a transition (debounced to handle rapid changes)
   */
  const queueTransition = useCallback((newSymbol: string, newInterval: string) => {
    // Skip if same as current
    if (newSymbol === currentSymbolRef.current && newInterval === currentIntervalRef.current) {
      return;
    }
    
    // Replace any pending transitions (we only care about the latest)
    transitionQueueRef.current = [{
      symbol: newSymbol,
      interval: newInterval,
      timestamp: Date.now(),
    }];
    
    // Start processing if not already
    processQueue();
  }, [processQueue]);

  // Detect changes in props and queue transitions
  useEffect(() => {
    if (symbol !== currentSymbolRef.current || interval !== currentIntervalRef.current) {
      queueTransition(symbol, interval);
    }
  }, [symbol, interval, queueTransition]);

  // Clear prefetch cache when symbol changes
  useEffect(() => {
    clearPrefetchCache();
  }, [symbol, clearPrefetchCache]);

  return {
    isTransitioning,
    transitionProgress,
    previousState,
    saveChartState,
    getChartState,
    prefetchInterval,
    getPrefetchedData,
    queueTransition,
  };
};
