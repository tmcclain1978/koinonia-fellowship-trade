import { useState, useEffect, useCallback, useRef } from "react";

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
}

interface MarketDataStreamOptions {
  symbols: string[];
  enabled?: boolean;
  onPriceUpdate?: (price: StreamingPrice) => void;
  onConnectionChange?: (connected: boolean) => void;
}

// Simulated market data generator for demo purposes
// In production, this would connect to a real WebSocket feed
const generateMarketData = (symbol: string, previousPrice?: number): StreamingPrice => {
  const basePrice = previousPrice || getBasePrice(symbol);
  const volatility = 0.001; // 0.1% volatility per tick
  const randomChange = (Math.random() - 0.5) * 2 * volatility;
  const newPrice = basePrice * (1 + randomChange);
  
  const spread = newPrice * 0.0005; // 0.05% spread
  const dailyChange = (Math.random() - 0.3) * 2; // Slightly bullish bias
  
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
  };
};

const getBasePrice = (symbol: string): number => {
  const basePrices: Record<string, number> = {
    'AAPL': 178.50,
    'MSFT': 378.25,
    'GOOGL': 141.80,
    'AMZN': 178.90,
    'TSLA': 248.50,
    'NVDA': 875.30,
    'META': 505.75,
    'SPY': 475.20,
    'QQQ': 405.80,
    'AMD': 145.60,
  };
  return basePrices[symbol.toUpperCase()] || 100 + Math.random() * 200;
};

export const useMarketDataStream = ({
  symbols,
  enabled = true,
  onPriceUpdate,
  onConnectionChange,
}: MarketDataStreamOptions) => {
  const [prices, setPrices] = useState<Map<string, StreamingPrice>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickCount, setTickCount] = useState(0);
  
  const previousPricesRef = useRef<Map<string, number>>(new Map());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Simulated WebSocket connection
  const connect = useCallback(() => {
    if (!enabled || symbols.length === 0) return;

    console.log('📡 Connecting to market data stream for:', symbols);
    
    // Simulate connection delay
    setTimeout(() => {
      setIsConnected(true);
      setError(null);
      onConnectionChange?.(true);
      console.log('✅ Market data stream connected');

      // Start simulated data stream
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
      }, 250); // Update every 250ms for smooth streaming
    }, 500);
  }, [symbols, enabled, onPriceUpdate, onConnectionChange]);

  const disconnect = useCallback(() => {
    console.log('🔌 Disconnecting market data stream');
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
    onConnectionChange?.(false);
  }, [onConnectionChange]);

  const subscribe = useCallback((newSymbols: string[]) => {
    console.log('📊 Subscribing to:', newSymbols);
    // In a real implementation, this would send a subscribe message to the WebSocket
  }, []);

  const unsubscribe = useCallback((removeSymbols: string[]) => {
    console.log('📉 Unsubscribing from:', removeSymbols);
    // In a real implementation, this would send an unsubscribe message
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

  // Helper to get a single price
  const getPrice = useCallback((symbol: string): StreamingPrice | undefined => {
    return prices.get(symbol.toUpperCase());
  }, [prices]);

  // Get all prices as array
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
    connect,
    disconnect,
    subscribe,
    unsubscribe,
  };
};
