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

  // Fetch real market data from Polygon
  const fetchRealData = useCallback(async () => {
    if (symbols.length === 0) return false;

    try {
      const { data, error: fetchError } = await supabase.functions.invoke('market-data-stream', {
        body: { action: 'get_quotes', symbols },
      });

      if (fetchError) throw fetchError;
      
      if (data?.mock) {
        console.log('📊 Polygon API not configured, using simulated data');
        return false;
      }

      if (data?.quotes) {
        data.quotes.forEach((quote: any) => {
          if (quote.error) return;
          
          const previousPrice = previousPricesRef.current.get(quote.symbol);
          const direction: 'up' | 'down' | 'unchanged' = previousPrice
            ? quote.price > previousPrice ? 'up' : quote.price < previousPrice ? 'down' : 'unchanged'
            : 'unchanged';

          const priceData: StreamingPrice = {
            symbol: quote.symbol,
            price: quote.price,
            bid: quote.bid,
            ask: quote.ask,
            volume: quote.volume,
            change: quote.change,
            changePercent: quote.changePercent,
            high: quote.high,
            low: quote.low,
            open: quote.open,
            timestamp: new Date(),
            direction,
            source: 'polygon',
          };

          previousPricesRef.current.set(quote.symbol, quote.price);
          
          setPrices((prev) => {
            const newPrices = new Map(prev);
            newPrices.set(quote.symbol, priceData);
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
      console.error('Error fetching real data:', err);
      return false;
    }
  }, [symbols, onPriceUpdate]);

  // Start simulated data stream
  const startSimulatedStream = useCallback(() => {
    console.log('🎮 Starting simulated market data stream');
    setDataSource('simulated');
    
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
    }, 250);
  }, [symbols, onPriceUpdate]);

  // Connect to data stream
  const connect = useCallback(async () => {
    if (!enabled || symbols.length === 0) return;

    console.log('📡 Connecting to market data stream for:', symbols);
    
    // Try real data first if enabled
    if (useRealData) {
      const realDataSuccess = await fetchRealData();
      
      if (realDataSuccess) {
        isRealDataRef.current = true;
        // Start polling for real data (every 1 second)
        intervalRef.current = setInterval(fetchRealData, 1000);
        setIsConnected(true);
        setError(null);
        onConnectionChange?.(true);
        console.log('✅ Connected to Polygon market data');
        return;
      }
    }

    // Fall back to simulated data
    isRealDataRef.current = false;
    startSimulatedStream();
    setIsConnected(true);
    setError(null);
    onConnectionChange?.(true);
    console.log('✅ Connected to simulated market data');
  }, [symbols, enabled, useRealData, fetchRealData, startSimulatedStream, onConnectionChange]);

  const disconnect = useCallback(() => {
    console.log('🔌 Disconnecting market data stream');
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    setIsConnected(false);
    onConnectionChange?.(false);
  }, [onConnectionChange]);

  const subscribe = useCallback((newSymbols: string[]) => {
    console.log('📊 Subscribing to:', newSymbols);
  }, []);

  const unsubscribe = useCallback((removeSymbols: string[]) => {
    console.log('📉 Unsubscribing from:', removeSymbols);
    removeSymbols.forEach((symbol) => {
      previousPricesRef.current.delete(symbol);
      setPrices((prev) => {
        const newPrices = new Map(prev);
        newPrices.delete(symbol);
        return newPrices;
      });
    });
  }, []);

  // Auto-connect when enabled and symbols change
  useEffect(() => {
    if (enabled && symbols.length > 0) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, symbols.join(',')]);

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
