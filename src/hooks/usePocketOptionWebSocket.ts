import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface WebSocketMessage {
  type: string;
  data?: any;
  status?: string;
  message?: string;
}

interface Trade {
  asset: string;
  action: 'call' | 'put';
  amount: number;
  duration: number;
}

export const usePocketOptionWebSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const connect = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Get Supabase project details from environment
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const projectRef = supabaseUrl.split('//')[1].split('.')[0];
      
      // Construct WebSocket URL with auth token as query parameter
      const wsUrl = `wss://${projectRef}.supabase.co/functions/v1/pocketoption-websocket?token=${session.access_token}`;
      
      console.log('Connecting to WebSocket:', wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connection opened');
        // Send connect message to initiate PocketOption connection
        ws.send(JSON.stringify({ type: 'connect' }));
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('Received WebSocket message:', message);

          switch (message.type) {
            case 'connection':
              if (message.status === 'connected') {
                setIsConnected(true);
                toast({
                  title: 'Connected',
                  description: 'Successfully connected to PocketOption',
                });
              } else if (message.status === 'disconnected') {
                setIsConnected(false);
                toast({
                  title: 'Disconnected',
                  description: 'Connection to PocketOption lost',
                  variant: 'destructive',
                });
              }
              break;

            case 'po_ready':
              console.log('PocketOption ready for commands');
              // Request initial balance
              ws.send(JSON.stringify({ type: 'get_balance' }));
              break;

            case 'po_data':
              // Handle structured data from PocketOption
              handlePocketOptionData(message.data);
              break;

            case 'error':
              console.error('WebSocket error:', message.message);
              toast({
                title: 'Connection Error',
                description: message.message || 'Unknown error occurred',
                variant: 'destructive',
              });
              break;

            default:
              console.log('Unhandled message type:', message.type);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        toast({
          title: 'WebSocket Error',
          description: 'Connection error occurred',
          variant: 'destructive',
        });
      };

      ws.onclose = () => {
        console.log('WebSocket connection closed');
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect...');
          connect();
        }, 5000);
      };
    } catch (error: any) {
      console.error('Error connecting to WebSocket:', error);
      toast({
        title: 'Connection Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [toast]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
  }, []);

  const executeTrade = useCallback((trade: Trade) => {
    if (!wsRef.current || !isConnected) {
      toast({
        title: 'Not Connected',
        description: 'Please connect to PocketOption first',
        variant: 'destructive',
      });
      return;
    }

    console.log('Executing trade:', trade);
    wsRef.current.send(JSON.stringify({
      type: 'trade',
      ...trade,
    }));
  }, [isConnected, toast]);

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

  const handlePocketOptionData = (data: any) => {
    if (!data || !Array.isArray(data)) return;

    const [event, payload] = data;

    switch (event) {
      case 'balance':
        if (payload && typeof payload.balance === 'number') {
          setBalance(payload.balance);
          console.log('Balance updated:', payload.balance);
        }
        break;

      case 'candle':
        if (payload && payload.asset && typeof payload.close === 'number') {
          setPrices(prev => ({
            ...prev,
            [payload.asset]: payload.close,
          }));
        }
        break;

      case 'trade':
        console.log('Trade result:', payload);
        if (payload && payload.status === 'win') {
          toast({
            title: 'Trade Won!',
            description: `Profit: $${payload.profit?.toFixed(2) || '0.00'}`,
          });
        } else if (payload && payload.status === 'loss') {
          toast({
            title: 'Trade Lost',
            description: `Loss: $${Math.abs(payload.profit || 0).toFixed(2)}`,
            variant: 'destructive',
          });
        }
        break;

      default:
        console.log('Unhandled PocketOption event:', event, payload);
    }
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    balance,
    prices,
    connect,
    disconnect,
    executeTrade,
    changeBalanceMode,
    subscribeToCandles,
  };
};
