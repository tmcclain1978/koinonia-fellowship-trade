import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PolygonTrade {
  symbol: string;
  price: number;
  size: number;
  timestamp: number;
  conditions?: number[];
}

export interface PolygonQuote {
  symbol: string;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  timestamp: number;
}

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

interface UsePolygonWebSocketOptions {
  symbols: string[];
  enabled?: boolean;
  onTrade?: (trade: PolygonTrade) => void;
  onQuote?: (quote: PolygonQuote) => void;
  onPriceUpdate?: (price: StreamingPrice) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export const usePolygonWebSocket = ({
  symbols,
  enabled = true,
  onTrade,
  onQuote,
  onPriceUpdate,
  onConnectionChange,
}: UsePolygonWebSocketOptions) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Map<string, StreamingPrice>>(new Map());
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connectionType, setConnectionType] = useState<'websocket' | 'polling' | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const previousPricesRef = useRef<Map<string, number>>(new Map());
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // Fetch quotes via REST API (polling fallback)
  const fetchQuotes = useCallback(async () => {
    if (symbols.length === 0) return;

    try {
      const { data, error: fetchError } = await supabase.functions.invoke('market-data-stream', {
        body: { action: 'get_quotes', symbols },
      });

      if (fetchError) throw fetchError;

      if (data?.quotes) {
        const newPrices = new Map<string, StreamingPrice>();
        
        data.quotes.forEach((quote: any) => {
          if (quote.error) return;
          
          const previousPrice = previousPricesRef.current.get(quote.symbol);
          const direction: 'up' | 'down' | 'unchanged' = previousPrice
            ? quote.price > previousPrice ? 'up' : quote.price < previousPrice ? 'down' : 'unchanged'
            : 'unchanged';

          const priceData: StreamingPrice = {
            symbol: quote.symbol,
            price: quote.price,
            bid: quote.bid || quote.price - 0.01,
            ask: quote.ask || quote.price + 0.01,
            volume: quote.volume || 0,
            change: quote.change || 0,
            changePercent: quote.changePercent || 0,
            high: quote.high || quote.price,
            low: quote.low || quote.price,
            open: quote.open || quote.price,
            timestamp: new Date(),
            direction,
            source: data.source === 'polygon' ? 'polygon' : 'simulated',
          };

          newPrices.set(quote.symbol, priceData);
          previousPricesRef.current.set(quote.symbol, quote.price);
          onPriceUpdate?.(priceData);
        });

        setPrices(newPrices);
        setLastUpdate(new Date());
        setIsConnected(true);
        setError(null);
      }
    } catch (err: any) {
      console.error('Error fetching quotes:', err);
      setError(err.message);
    }
  }, [symbols, onPriceUpdate]);

  // Connect to Polygon WebSocket
  const connectWebSocket = useCallback(async () => {
    if (symbols.length === 0) return;

    try {
      console.log('🔌 Attempting Polygon WebSocket connection...');
      
      const { data, error: fetchError } = await supabase.functions.invoke('market-data-stream', {
        body: { action: 'get_websocket_url' },
      });

      if (fetchError || data?.mock) {
        console.log('📊 Falling back to polling mode');
        setConnectionType('polling');
        startPolling();
        return;
      }

      // Connect to Polygon WebSocket
      const ws = new WebSocket(data.wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ Polygon WebSocket connected');
        // Send auth message
        ws.send(JSON.stringify(data.authMessage));
      };

      ws.onmessage = (event) => {
        try {
          const messages = JSON.parse(event.data);
          
          messages.forEach((msg: any) => {
            if (msg.ev === 'status') {
              if (msg.status === 'auth_success') {
                console.log('🔐 Polygon auth successful');
                // Subscribe to symbols
                const subscribeMsg = data.subscribeFormat(symbols);
                ws.send(JSON.stringify(subscribeMsg));
                setIsConnected(true);
                setConnectionType('websocket');
                onConnectionChange?.(true);
              } else if (msg.status === 'auth_failed') {
                console.error('❌ Polygon auth failed');
                setError('Authentication failed');
                ws.close();
                startPolling();
              }
            } else if (msg.ev === 'T') {
              // Trade event
              const trade: PolygonTrade = {
                symbol: msg.sym,
                price: msg.p,
                size: msg.s,
                timestamp: msg.t,
                conditions: msg.c,
              };
              
              onTrade?.(trade);
              
              // Update price
              const previousPrice = previousPricesRef.current.get(trade.symbol);
              const direction: 'up' | 'down' | 'unchanged' = previousPrice
                ? trade.price > previousPrice ? 'up' : trade.price < previousPrice ? 'down' : 'unchanged'
                : 'unchanged';

              const priceData: StreamingPrice = {
                symbol: trade.symbol,
                price: trade.price,
                bid: trade.price - 0.01,
                ask: trade.price + 0.01,
                volume: trade.size,
                change: 0,
                changePercent: 0,
                high: trade.price,
                low: trade.price,
                open: trade.price,
                timestamp: new Date(trade.timestamp),
                direction,
                source: 'polygon',
              };

              setPrices(prev => {
                const newPrices = new Map(prev);
                const existing = newPrices.get(trade.symbol);
                if (existing) {
                  priceData.high = Math.max(existing.high, trade.price);
                  priceData.low = Math.min(existing.low, trade.price);
                  priceData.open = existing.open;
                  priceData.change = trade.price - existing.open;
                  priceData.changePercent = (priceData.change / existing.open) * 100;
                }
                newPrices.set(trade.symbol, priceData);
                return newPrices;
              });

              previousPricesRef.current.set(trade.symbol, trade.price);
              setLastUpdate(new Date());
              onPriceUpdate?.(priceData);
            } else if (msg.ev === 'Q') {
              // Quote event
              const quote: PolygonQuote = {
                symbol: msg.sym,
                bidPrice: msg.bp,
                bidSize: msg.bs,
                askPrice: msg.ap,
                askSize: msg.as,
                timestamp: msg.t,
              };
              onQuote?.(quote);
            }
          });
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setIsConnected(false);
        onConnectionChange?.(false);
        
        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(`Reconnecting... attempt ${reconnectAttemptsRef.current}`);
          setTimeout(connectWebSocket, 2000 * reconnectAttemptsRef.current);
        } else {
          console.log('Max reconnect attempts reached, falling back to polling');
          startPolling();
        }
      };

    } catch (err: any) {
      console.error('Error connecting to WebSocket:', err);
      setError(err.message);
      startPolling();
    }
  }, [symbols, onTrade, onQuote, onPriceUpdate, onConnectionChange]);

  // Start polling mode
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    
    console.log('📊 Starting polling mode (every 1 second)');
    setConnectionType('polling');
    fetchQuotes();
    pollingRef.current = setInterval(fetchQuotes, 1000);
    setIsConnected(true);
    onConnectionChange?.(true);
  }, [fetchQuotes, onConnectionChange]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    console.log('🔌 Disconnecting...');
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    stopPolling();
    setIsConnected(false);
    setConnectionType(null);
    onConnectionChange?.(false);
  }, [stopPolling, onConnectionChange]);

  // Connect/disconnect based on enabled state
  useEffect(() => {
    if (enabled && symbols.length > 0) {
      connectWebSocket();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, symbols.join(',')]);

  // Update subscriptions when symbols change
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Resubscribe to new symbols
      const subscribeMsg = {
        action: 'subscribe',
        params: symbols.map(s => `T.${s}`).join(','),
      };
      wsRef.current.send(JSON.stringify(subscribeMsg));
    }
  }, [symbols]);

  const getPrice = useCallback((symbol: string): StreamingPrice | undefined => {
    return prices.get(symbol.toUpperCase());
  }, [prices]);

  return {
    prices,
    getPrice,
    isConnected,
    connectionType,
    error,
    lastUpdate,
    disconnect,
    reconnect: connectWebSocket,
  };
};
