import { useState, useEffect, useCallback, useRef } from "react";
import { schwabApi, SchwabQuote } from "@/lib/schwabApi";

export interface StreamingQuote extends SchwabQuote {
  lastUpdated: Date;
  previousPrice?: number;
  priceDirection?: 'up' | 'down' | 'unchanged';
}

interface UseSchwabStreamingOptions {
  symbols: string[];
  refreshInterval?: number; // in milliseconds, default 1000ms
  enabled?: boolean;
}

export const useSchwabStreaming = ({
  symbols,
  refreshInterval = 1000,
  enabled = true,
}: UseSchwabStreamingOptions) => {
  const [quotes, setQuotes] = useState<Map<string, StreamingQuote>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  const previousQuotesRef = useRef<Map<string, number>>(new Map());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchQuotes = useCallback(async () => {
    if (!enabled || symbols.length === 0) return;

    try {
      const fetchedQuotes = await schwabApi.getQuotes(symbols);
      
      const newQuotes = new Map<string, StreamingQuote>();
      
      fetchedQuotes.forEach((quote) => {
        const previousPrice = previousQuotesRef.current.get(quote.symbol);
        let priceDirection: 'up' | 'down' | 'unchanged' = 'unchanged';
        
        if (previousPrice !== undefined) {
          if (quote.lastPrice > previousPrice) {
            priceDirection = 'up';
          } else if (quote.lastPrice < previousPrice) {
            priceDirection = 'down';
          }
        }

        newQuotes.set(quote.symbol, {
          ...quote,
          lastUpdated: new Date(),
          previousPrice,
          priceDirection,
        });

        previousQuotesRef.current.set(quote.symbol, quote.lastPrice);
      });

      setQuotes(newQuotes);
      setLastUpdate(new Date());
      setIsConnected(true);
      setError(null);
    } catch (err: any) {
      console.error("Streaming error:", err);
      setError(err.message || "Failed to fetch quotes");
      setIsConnected(false);
    }
  }, [symbols, enabled]);

  // Start/stop streaming based on enabled state
  useEffect(() => {
    if (enabled && symbols.length > 0) {
      // Initial fetch
      fetchQuotes();
      
      // Set up interval for continuous updates
      intervalRef.current = setInterval(fetchQuotes, refreshInterval);
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else {
      // Clean up if disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsConnected(false);
    }
  }, [enabled, symbols.join(','), refreshInterval, fetchQuotes]);

  // Helper to get a single quote
  const getQuote = useCallback((symbol: string): StreamingQuote | undefined => {
    return quotes.get(symbol.toUpperCase());
  }, [quotes]);

  // Manual refresh
  const refresh = useCallback(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  // Pause streaming
  const pause = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Resume streaming
  const resume = useCallback(() => {
    if (!intervalRef.current && enabled && symbols.length > 0) {
      fetchQuotes();
      intervalRef.current = setInterval(fetchQuotes, refreshInterval);
      setIsConnected(true);
    }
  }, [enabled, symbols, refreshInterval, fetchQuotes]);

  return {
    quotes,
    getQuote,
    isConnected,
    error,
    lastUpdate,
    refresh,
    pause,
    resume,
  };
};
