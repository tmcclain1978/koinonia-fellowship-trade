import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { schwabApi, SchwabQuote } from "@/lib/schwabApi";

export interface StreamingQuote extends SchwabQuote {
  lastUpdated: Date;
  previousPrice?: number;
  priceDirection?: 'up' | 'down' | 'unchanged';
}

export interface AccountActivity {
  accountNumber: string;
  messageType: string;
  messageData: any;
  timestamp: Date;
}

interface UseSchwabStreamingOptions {
  symbols: string[];
  refreshInterval?: number; // in milliseconds, default 1000ms (for polling fallback)
  enabled?: boolean;
  useWebSocket?: boolean; // Try WebSocket first, fallback to polling
  subscribeToAccountActivity?: boolean;
}

type StreamingStatus = 'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'error' | 'polling';

export const useSchwabStreaming = ({
  symbols,
  refreshInterval = 1000,
  enabled = true,
  useWebSocket = true,
  subscribeToAccountActivity = false,
}: UseSchwabStreamingOptions) => {
  const [quotes, setQuotes] = useState<Map<string, StreamingQuote>>(new Map());
  const [accountActivity, setAccountActivity] = useState<AccountActivity[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<StreamingStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  const previousQuotesRef = useRef<Map<string, number>>(new Map());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const subscribedSymbolsRef = useRef<string[]>([]);
  const isWebSocketActiveRef = useRef(false);

  // Process quote updates (shared between WS and polling)
  const processQuotes = useCallback((fetchedQuotes: SchwabQuote[]) => {
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
  }, []);

  // Polling fallback
  const fetchQuotes = useCallback(async () => {
    if (!enabled || symbols.length === 0 || isWebSocketActiveRef.current) return;

    try {
      const fetchedQuotes = await schwabApi.getQuotes(symbols);
      processQuotes(fetchedQuotes);
      setStatus('polling');
    } catch (err: any) {
      console.error("Streaming error:", err);
      setError(err.message || "Failed to fetch quotes");
      setIsConnected(false);
    }
  }, [symbols, enabled, processQuotes]);

  // Handle WebSocket data messages
  const handleDataMessage = useCallback((message: any) => {
    if (message.service === 'QUOTE' || message.service === 'LEVELONE_EQUITIES') {
      const content = message.content;
      if (Array.isArray(content)) {
        setQuotes(prev => {
          const newQuotes = new Map(prev);
          
          for (const item of content) {
            const symbol = item.key || item['0'];
            if (!symbol) continue;

            const lastPrice = item['1'] || item.lastPrice || prev.get(symbol)?.lastPrice || 0;
            const previousPrice = previousQuotesRef.current.get(symbol);
            
            let priceDirection: 'up' | 'down' | 'unchanged' = 'unchanged';
            if (previousPrice !== undefined) {
              if (lastPrice > previousPrice) priceDirection = 'up';
              else if (lastPrice < previousPrice) priceDirection = 'down';
            }

            newQuotes.set(symbol, {
              symbol,
              lastPrice,
              bidPrice: item['2'] || item.bidPrice,
              askPrice: item['3'] || item.askPrice,
              bidSize: item['4'] || item.bidSize,
              askSize: item['5'] || item.askSize,
              volume: item['8'] || item.volume,
              netChange: item['9'] || item.netChange,
              netPercentChange: item['10'] || item.netPercentChange,
              lastUpdated: new Date(),
              previousPrice,
              priceDirection,
            });

            previousQuotesRef.current.set(symbol, lastPrice);
          }
          
          return newQuotes;
        });
        setLastUpdate(new Date());
      }
    }

    if (message.service === 'ACCT_ACTIVITY') {
      const content = message.content;
      if (Array.isArray(content)) {
        setAccountActivity(prev => {
          const newActivities = content.map(item => ({
            accountNumber: item.key || item['0'],
            messageType: item['1'] || 'UPDATE',
            messageData: item['2'] || item,
            timestamp: new Date(),
          }));
          return [...newActivities, ...prev].slice(0, 100);
        });
      }
    }
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current) return;
    
    fetchQuotes();
    intervalRef.current = setInterval(fetchQuotes, refreshInterval);
    setStatus('polling');
  }, [fetchQuotes, refreshInterval]);

  // WebSocket connection
  const connectWebSocket = useCallback(async (): Promise<boolean> => {
    if (!enabled || !useWebSocket) return false;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('[useSchwabStreaming] No session, falling back to polling');
        return false;
      }

      setStatus('connecting');
      setError(null);

      const projectId = 'cxsfpxsbejzpukrdrulu';
      const wsUrl = `wss://${projectId}.supabase.co/functions/v1/schwab-streaming`;
      
      // Create WebSocket with auth token in subprotocol
      const ws = new WebSocket(wsUrl, ['authorization', session.access_token]);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[useSchwabStreaming] WebSocket connected');
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[useSchwabStreaming] Received:', message.type);

          if (message.type === 'connected') {
            setStatus('authenticated');
            isWebSocketActiveRef.current = true;
            setIsConnected(true);
            
            // Stop polling if it was running
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            
            // Subscribe to symbols
            if (symbols.length > 0) {
              ws.send(JSON.stringify({
                action: 'subscribe',
                service: 'QUOTE',
                symbols: symbols,
                fields: '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15',
              }));
              subscribedSymbolsRef.current = symbols;
            }
            
            // Subscribe to account activity if requested
            if (subscribeToAccountActivity) {
              ws.send(JSON.stringify({ action: 'subscribe_account' }));
            }
          }

          if (message.type === 'data') {
            handleDataMessage(message);
          }

          if (message.type === 'error') {
            console.error('[useSchwabStreaming] Error:', message.message);
            setError(message.message);
          }

          if (message.type === 'disconnected') {
            setStatus('disconnected');
            isWebSocketActiveRef.current = false;
            scheduleReconnect();
          }
        } catch (err) {
          console.error('[useSchwabStreaming] Parse error:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[useSchwabStreaming] WebSocket error:', err);
        setError('WebSocket connection error - using polling fallback');
        setStatus('error');
        isWebSocketActiveRef.current = false;
      };

      ws.onclose = () => {
        console.log('[useSchwabStreaming] WebSocket closed');
        wsRef.current = null;
        isWebSocketActiveRef.current = false;
        
        // Start polling as fallback
        if (enabled && symbols.length > 0) {
          setStatus('polling');
          startPolling();
        } else {
          setStatus('disconnected');
        }
      };

      return true;
    } catch (err: any) {
      console.error('[useSchwabStreaming] Connection error:', err);
      setError(err.message || 'Failed to connect');
      setStatus('error');
      isWebSocketActiveRef.current = false;
      return false;
    }
  }, [enabled, useWebSocket, symbols, subscribeToAccountActivity, handleDataMessage, startPolling]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (reconnectAttemptsRef.current >= 3) {
      console.log('[useSchwabStreaming] Max reconnects, falling back to polling');
      startPolling();
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
    reconnectAttemptsRef.current++;

    reconnectTimeoutRef.current = setTimeout(() => {
      console.log('[useSchwabStreaming] Attempting reconnect...');
      connectWebSocket();
    }, delay);
  }, [connectWebSocket, startPolling]);

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
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Unsubscribe but keep connection
      if (subscribedSymbolsRef.current.length > 0) {
        wsRef.current.send(JSON.stringify({
          action: 'unsubscribe',
          service: 'QUOTE',
          symbols: subscribedSymbolsRef.current,
        }));
      }
    }
    setIsConnected(false);
  }, []);

  // Resume streaming
  const resume = useCallback(() => {
    if (isWebSocketActiveRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      // Re-subscribe via WebSocket
      if (symbols.length > 0) {
        wsRef.current.send(JSON.stringify({
          action: 'subscribe',
          service: 'QUOTE',
          symbols: symbols,
          fields: '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15',
        }));
        subscribedSymbolsRef.current = symbols;
      }
      setIsConnected(true);
    } else if (!intervalRef.current && enabled && symbols.length > 0) {
      fetchQuotes();
      intervalRef.current = setInterval(fetchQuotes, refreshInterval);
      setIsConnected(true);
    }
  }, [enabled, symbols, refreshInterval, fetchQuotes]);

  // Connect/disconnect based on enabled state
  useEffect(() => {
    if (enabled && symbols.length > 0) {
      // Try WebSocket first
      if (useWebSocket) {
        connectWebSocket().then(connected => {
          if (!connected) {
            startPolling();
          }
        });
      } else {
        startPolling();
      }
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
        isWebSocketActiveRef.current = false;
      };
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsConnected(false);
    }
  }, [enabled, symbols.join(','), useWebSocket, connectWebSocket, startPolling]);

  // Update subscriptions when symbols change (for WebSocket)
  useEffect(() => {
    if (isWebSocketActiveRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      // Unsubscribe from old symbols
      if (subscribedSymbolsRef.current.length > 0) {
        wsRef.current.send(JSON.stringify({
          action: 'unsubscribe',
          service: 'QUOTE',
          symbols: subscribedSymbolsRef.current,
        }));
      }
      
      // Subscribe to new symbols
      if (symbols.length > 0) {
        wsRef.current.send(JSON.stringify({
          action: 'subscribe',
          service: 'QUOTE',
          symbols: symbols,
          fields: '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15',
        }));
        subscribedSymbolsRef.current = symbols;
      }
    }
  }, [symbols.join(',')]);

  return {
    quotes,
    getQuote,
    accountActivity,
    status,
    isConnected,
    error,
    lastUpdate,
    refresh,
    pause,
    resume,
  };
};
