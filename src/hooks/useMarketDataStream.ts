import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StreamingPrice {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  timestamp: Date;
  direction: 'up' | 'down' | 'unchanged';
  source: 'polygon' | 'simulated';
}

interface MarketDataStreamOptions {
  symbols: string[];
  enabled?: boolean;
  useRealData?: boolean; // Try to use real Polygon data
  onPriceUpdate?: (price: StreamingPrice) => void;
  onConnectionChange?: (connected: boolean) => void;
}

// Simulated market data generator for demo/fallback
const generateMarketData = (symbol: string, previousPrice?: number): StreamingPrice => {
  const basePrice = previousPrice || getBasePrice(symbol);
  const volatility = 0.001;
  const randomChange = (Math.random() - 0.5) * 2 * volatility;
  const newPrice = basePrice * (1 + randomChange);
  
  const spread = newPrice * 0.0005;
  const dailyChange = (Math.random() - 0.3) * 2;
  
  return {
    symbol,
    price: Number(newPrice.toFixed(2)),
    bid: Number((newPrice - spread).toFixed(2)),
    ask: Number((newPrice + spread).toFixed(2)),
    volume: Math.floor(Math.random() * 100000) + 50000,
    change: Number(dailyChange.toFixed(2)),
    changePercent: Number((dailyChange / newPrice * 100).toFixed(2)),
    high: Number((newPrice * 1.02).toFixed(2)),
    low: Number((newPrice * 0.98).toFixed(2)),
    open: Number((newPrice * 0.995).toFixed(2)),
    timestamp: new Date(),
    direction: previousPrice 
      ? (newPrice > previousPrice ? 'up' : newPrice < previousPrice ? 'down' : 'unchanged')
      : 'unchanged',
    source: 'simulated',
  };
};

const getBasePrice = (symbol: string): number => {
  const basePrices: Record<string, number> = {
    'AAPL': 178.50, 'MSFT': 378.25, 'GOOGL': 141.80, 'AMZN': 178.90,
    'TSLA': 248.50, 'NVDA': 875.30, 'META': 505.75, 'SPY': 475.20,
    'QQQ': 405.80, 'AMD': 145.60, 'NFLX': 485.20, 'DIS': 95.40,
  };
  return basePrices[symbol.toUpperCase()] || 100 + Math.random() * 200;
};

export const useMarketDataStream = ({
  symbols,
  enabled = true,
  useRealData = true,
  onPriceUpdate,
  onConnectionChange,
}: MarketDataStreamOptions) => {
  const [prices, setPrices] = useState<Map<string, StreamingPrice>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickCount, setTickCount] = useState(0);
  const [dataSource, setDataSource] = useState<'polygon' | 'simulated'>('simulated');
  
  const previousPricesRef = useRef<Map<string, number>>(new Map());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRealDataRef = useRef(false);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const isNotFoundError = useCallback((err: any) => {
    return (
      err?.code === "NOT_FOUND" ||
      /requested function was not found/i.test(String(err?.message ?? ""))
    );
  }, []);

  // Memoized symbols key to prevent unnecessary reconnections
  const symbolsKey = symbols.slice().sort().join(',');

  const toFiniteNumber = useCallback((value: unknown, fallback = 0): number => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return fallback;
      const n = Number(trimmed);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  }, []);

  // Fetch real market data from Polygon
  const fetchRealData = useCallback(async () => {
    if (symbols.length === 0) return false;

     // Normalize and de-dupe to avoid duplicate fetches (e.g., ["SPY","SPY","QQQ"])
     const normalizedSymbols = Array.from(
       new Set(
         symbols
           .map((s) => String(s || "").trim().toUpperCase())
           .filter(Boolean)
       )
     );

     if (normalizedSymbols.length === 0) return false;

    try {
      // The gateway can briefly return a NOT_FOUND during deployments/propagation.
      // Retry a couple times before we fall back to simulated data.
      let data: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const resp = await supabase.functions.invoke('market-data-stream', {
          body: { action: 'get_quotes', symbols: normalizedSymbols },
        });

        if (resp.error) {
          if (isNotFoundError(resp.error) && attempt < 2) {
            await sleep(250 * (attempt + 1));
            continue;
          }
          throw resp.error;
        }

        data = resp.data;
        break;
      }
      
      if (data?.mock) {
        // Silent fallback to simulated data
        return false;
      }

      if (data?.quotes) {
        data.quotes.forEach((quote: any) => {
          if (quote.error) return;

          const symbol = String(quote.symbol || "").toUpperCase();
          if (!symbol) return;

          const price = toFiniteNumber(quote.price, NaN);
          if (!Number.isFinite(price)) return;

          const bid = toFiniteNumber(quote.bid, price);
          const ask = toFiniteNumber(quote.ask, price);
          const volume = toFiniteNumber(quote.volume, 0);
          const change = toFiniteNumber(quote.change, 0);
          const changePercent = toFiniteNumber(quote.changePercent, 0);
          const high = toFiniteNumber(quote.high, price);
          const low = toFiniteNumber(quote.low, price);
          const open = toFiniteNumber(quote.open, price);
          
          const previousPrice = previousPricesRef.current.get(symbol);
          const direction: 'up' | 'down' | 'unchanged' = previousPrice
            ? price > previousPrice ? 'up' : price < previousPrice ? 'down' : 'unchanged'
            : 'unchanged';

          const priceData: StreamingPrice = {
            symbol,
            price,
            bid,
            ask,
            volume,
            change,
            changePercent,
            high,
            low,
            open,
            timestamp: new Date(),
            direction,
            source: 'polygon',
          };

          previousPricesRef.current.set(symbol, price);
          
          setPrices((prev) => {
            const newPrices = new Map(prev);
            newPrices.set(symbol, priceData);
            return newPrices;
          });

          onPriceUpdate?.(priceData);
        });

        setTickCount((prev) => prev + 1);
        setDataSource('polygon');
        return true;
      }
      return false;
    } catch (err: any) {
      // Avoid spamming logs for transient NOT_FOUNDs (usually during deploy propagation)
      if (!isNotFoundError(err)) {
        console.error('Error fetching real data:', err);
      }
      return false;
    }
  }, [symbolsKey, symbols.length, isNotFoundError, onPriceUpdate, toFiniteNumber]);

  // Start simulated data stream - reduced frequency
  const startSimulatedStream = useCallback(() => {
    // Silent start - only log once
    if (!isRealDataRef.current) {
      setDataSource('simulated');
    }
    
    // Reduced from 250ms to 1000ms to prevent excessive updates
    intervalRef.current = setInterval(() => {
      symbols.forEach((symbol) => {
        const previousPrice = previousPricesRef.current.get(symbol);
        const priceData = generateMarketData(symbol, previousPrice);
        
        previousPricesRef.current.set(symbol, priceData.price);
        
        setPrices((prev) => {
          const newPrices = new Map(prev);
          newPrices.set(symbol, priceData);
          return newPrices;
        });

        onPriceUpdate?.(priceData);
      });

      setTickCount((prev) => prev + 1);
    }, 1000); // Changed from 250ms to 1000ms
  }, [symbols, onPriceUpdate]);

  // Connect to data stream
  const connect = useCallback(async () => {
    if (!enabled || symbols.length === 0) return;
    
    // Try real data first if enabled
    if (useRealData) {
      const realDataSuccess = await fetchRealData();
      
      if (realDataSuccess) {
        isRealDataRef.current = true;
        // Start polling for real data (every 5 seconds instead of 1 second)
        intervalRef.current = setInterval(fetchRealData, 5000);
        setIsConnected(true);
        setError(null);
        onConnectionChange?.(true);
        return;
      }
    }

    // Fall back to simulated data
    isRealDataRef.current = false;
    startSimulatedStream();
    setIsConnected(true);
    setError(null);
    onConnectionChange?.(true);
  }, [symbols.length, enabled, useRealData, fetchRealData, startSimulatedStream, onConnectionChange]);

  const disconnect = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    setIsConnected(false);
    onConnectionChange?.(false);
  }, [onConnectionChange]);

  const subscribe = useCallback((_newSymbols: string[]) => {
    // Silent subscription
  }, []);

  const unsubscribe = useCallback((removeSymbols: string[]) => {
    removeSymbols.forEach((symbol) => {
      previousPricesRef.current.delete(symbol);
      setPrices((prev) => {
        const newPrices = new Map(prev);
        newPrices.delete(symbol);
        return newPrices;
      });
    });
  }, []);

  const symbolsKeyRef = useRef(symbolsKey);
  const isInitializedRef = useRef(false);

  // Auto-connect when enabled and symbols change - debounced
  useEffect(() => {
    // Skip if symbols haven't changed
    if (symbolsKeyRef.current === symbolsKey && isInitializedRef.current) {
      return;
    }
    symbolsKeyRef.current = symbolsKey;
    isInitializedRef.current = true;
    
    if (enabled && symbols.length > 0) {
      // Debounce connection
      const timeout = setTimeout(() => {
        connect();
      }, 100);
      return () => {
        clearTimeout(timeout);
        disconnect();
      };
    } else {
      disconnect();
    }
  }, [enabled, symbolsKey]);

  const getPrice = useCallback((symbol: string): StreamingPrice | undefined => {
    return prices.get(symbol.toUpperCase());
  }, [prices]);

  const getAllPrices = useCallback((): StreamingPrice[] => {
    return Array.from(prices.values());
  }, [prices]);

  return {
    prices,
    getPrice,
    getAllPrices,
    isConnected,
    error,
    tickCount,
    dataSource,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
  };
};
