import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface WebSocketMessage {
  type: string;
  data?: any;
  status?: string;
  message?: string;
  event?: string;
  endpoint?: string;
  attemptNumber?: number;
  totalEndpoints?: number;
  code?: string;
}

export interface Trade {
  asset: string;
  action: 'call' | 'put';
  amount: number;
  duration: number;
  isDemo?: number;
}

export interface ConnectionStatus {
  state: 'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'error';
  endpoint?: string;
  attempt?: number;
  totalAttempts?: number;
  errorMessage?: string;
}

export const usePocketOptionWebSocket = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ state: 'disconnected' });
  const [balance, setBalance] = useState<number | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [deals, setDeals] = useState<any[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const keepAliveRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Computed property for backward compatibility
  const isConnected = connectionStatus.state === 'connected' || connectionStatus.state === 'authenticated';

  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    try {
      clearTimers();
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      setConnectionStatus({ state: 'connecting' });

      // Get Supabase project details from environment
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const projectRef = supabaseUrl.split('//')[1].split('.')[0];
      
      // Construct WebSocket URL with auth token as query parameter
      const wsUrl = `wss://${projectRef}.supabase.co/functions/v1/pocketoption-websocket?token=${session.access_token}`;
      
      console.log('Connecting to WebSocket bridge...');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket bridge opened, initiating PocketOption connection...');
        reconnectAttemptRef.current = 0;
        
        // Send connect message to initiate PocketOption connection
        ws.send(JSON.stringify({ type: 'connect' }));
        
        // Start keep-alive pings every 30 seconds
        keepAliveRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'authenticated':
              console.log('Bridge authenticated, connecting to PocketOption...');
              break;
              
            case 'connection_attempt':
              setConnectionStatus({
                state: 'connecting',
                endpoint: message.endpoint,
                attempt: message.attemptNumber,
                totalAttempts: message.totalEndpoints
              });
              break;

            case 'connection':
              if (message.status === 'connected') {
                setConnectionStatus({
                  state: 'connected',
                  endpoint: message.endpoint
                });
                toast({
                  title: 'Connected',
                  description: `Connected to ${message.endpoint || 'PocketOption'}`,
                });
              } else if (message.status === 'disconnected') {
                setConnectionStatus({ 
                  state: 'disconnected',
                  errorMessage: message.message
                });
              }
              break;

            case 'po_authenticated':
              console.log('Successfully authenticated with PocketOption');
              setConnectionStatus(prev => ({
                ...prev,
                state: 'authenticated'
              }));
              toast({
                title: 'Authenticated',
                description: 'Successfully authenticated with PocketOption',
              });
              // Request initial balance
              ws.send(JSON.stringify({ type: 'get_balance' }));
              break;

            case 'po_balance':
              if (message.data && typeof message.data.balance === 'number') {
                setBalance(message.data.balance);
                console.log('Balance updated:', message.data.balance);
              } else if (message.data && typeof message.data === 'number') {
                setBalance(message.data);
              }
              break;

            case 'po_candles':
              if (message.data) {
                const candle = message.data;
                if (candle.asset && typeof candle.close === 'number') {
                  setPrices(prev => ({
                    ...prev,
                    [candle.asset]: candle.close,
                  }));
                }
              }
              break;

            case 'po_deals':
              if (message.data) {
                setDeals(message.data);
              }
              break;

            case 'po_order':
              console.log('Order result:', message.data);
              if (message.data?.profit !== undefined) {
                const profit = message.data.profit;
                if (profit > 0) {
                  toast({
                    title: 'Trade Won!',
                    description: `Profit: $${profit.toFixed(2)}`,
                  });
                } else if (profit < 0) {
                  toast({
                    title: 'Trade Lost',
                    description: `Loss: $${Math.abs(profit).toFixed(2)}`,
                    variant: 'destructive',
                  });
                }
              }
              break;

            case 'po_data':
              console.log('PocketOption event:', message.event, message.data);
              break;

            case 'error':
              console.error('WebSocket error:', message.message);
              setConnectionStatus({
                state: 'error',
                errorMessage: message.message
              });
              
              if (message.code === 'AUTH_FAILED') {
                toast({
                  title: 'Authentication Failed',
                  description: 'Your SSID may be expired. Please update your credentials.',
                  variant: 'destructive',
                });
              } else {
                toast({
                  title: 'Connection Error',
                  description: message.message || 'Unknown error occurred',
                  variant: 'destructive',
                });
              }
              break;

            case 'pong':
              // Keep-alive response received
              break;

            default:
              console.log('Unhandled message type:', message.type, message);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus({
          state: 'error',
          errorMessage: 'WebSocket connection error'
        });
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed - code:', event.code);
        clearTimers();
        wsRef.current = null;
        
        setConnectionStatus(prev => ({
          ...prev,
          state: 'disconnected'
        }));

        // Exponential backoff reconnection (2s, 4s, 8s, 16s, max 30s)
        const baseDelay = 2000;
        const maxDelay = 30000;
        const delay = Math.min(baseDelay * Math.pow(2, reconnectAttemptRef.current), maxDelay);
        reconnectAttemptRef.current++;

        if (reconnectAttemptRef.current <= 5) {
          console.log(`Reconnecting in ${delay / 1000}s (attempt ${reconnectAttemptRef.current})...`);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          toast({
            title: 'Connection Lost',
            description: 'Max reconnection attempts reached. Click Connect to try again.',
            variant: 'destructive',
          });
        }
      };
    } catch (error: any) {
      console.error('Error connecting to WebSocket:', error);
      setConnectionStatus({
        state: 'error',
        errorMessage: error.message
      });
      toast({
        title: 'Connection Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [toast, clearTimers]);

  const disconnect = useCallback(() => {
    clearTimers();
    reconnectAttemptRef.current = 10; // Prevent auto-reconnect

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionStatus({ state: 'disconnected' });
  }, [clearTimers]);

  const executeTrade = useCallback((trade: Trade) => {
    if (!wsRef.current || connectionStatus.state !== 'authenticated') {
      toast({
        title: 'Not Ready',
        description: connectionStatus.state === 'connected' 
          ? 'Waiting for authentication...' 
          : 'Please connect to PocketOption first',
        variant: 'destructive',
      });
      return;
    }

    console.log('Executing trade:', trade);
    wsRef.current.send(JSON.stringify({
      type: 'trade',
      ...trade,
    }));
  }, [connectionStatus.state, toast]);

  const changeBalanceMode = useCallback((mode: 'demo' | 'real') => {
    if (!wsRef.current || !isConnected) {
      toast({
        title: 'Not Connected',
        description: 'Please connect to PocketOption first',
        variant: 'destructive',
      });
      return;
    }

    console.log('Changing balance mode to:', mode);
    wsRef.current.send(JSON.stringify({
      type: 'change_balance',
      mode,
    }));
  }, [isConnected, toast]);

  const subscribeToCandles = useCallback((asset: string) => {
    if (!wsRef.current || !isConnected) return;

    console.log('Subscribing to candles for:', asset);
    wsRef.current.send(JSON.stringify({
      type: 'subscribe_candles',
      asset,
    }));
  }, [isConnected]);

  useEffect(() => {
    return () => {
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [clearTimers]);

  return {
    isConnected,
    connectionStatus,
    balance,
    prices,
    deals,
    connect,
    disconnect,
    executeTrade,
    changeBalanceMode,
    subscribeToCandles,
  };
};
