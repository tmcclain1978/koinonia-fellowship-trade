import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, upgrade, connection',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { 
      status: 400,
      headers: corsHeaders 
    });
  }

  console.log("WebSocket upgrade request received");

  // Get token from query parameter
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  
  console.log("Token present:", !!token);

  // Upgrade to WebSocket MUST happen synchronously
  const { socket, response } = Deno.upgradeWebSocket(req);
  
  let poSocket: WebSocket | null = null;
  let isConnected = false;
  let heartbeatInterval: number | null = null;
  let credentials: any = null;

  // Handle WebSocket open
  socket.onopen = async () => {
    console.log("Client WebSocket opened, authenticating...");
    
    try {
      if (!token) {
        console.error("No authentication token provided");
        socket.close(1008, "No authentication token provided");
        return;
      }

      // Authenticate user
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        {
          global: {
            headers: { Authorization: `Bearer ${token}` },
          },
        }
      );

      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) {
        console.error("Authentication failed:", authError);
        socket.close(1008, "Authentication failed");
        return;
      }
      
      console.log("User authenticated:", user.id);

      // Get user's PocketOption credentials
      const { data: creds, error: credError } = await supabaseClient
        .from('user_api_credentials')
        .select('pocketoption_api_key, pocketoption_ssid')
        .eq('user_id', user.id)
        .single();

      if (credError || !creds?.pocketoption_ssid) {
        console.error("PocketOption credentials not found");
        socket.close(1008, "PocketOption credentials not found");
        return;
      }

      credentials = creds;
      console.log(`WebSocket setup complete for user ${user.id}`);
      
      // Send ready message to client
      socket.send(JSON.stringify({ 
        type: 'authenticated',
        message: 'Ready to connect'
      }));
    } catch (error) {
      console.error("WebSocket setup error:", error);
      socket.close(1011, error.message);
    }
  };

  // Connect to PocketOption WebSocket
  const connectToPocketOption = () => {
    if (!credentials) {
      socket.send(JSON.stringify({ 
        type: 'error',
        message: 'Not authenticated yet'
      }));
      return;
    }

    try {
      // PocketOption WebSocket endpoint
      poSocket = new WebSocket("wss://platform44.po2.capital/socket.io/?EIO=3&transport=websocket");

      poSocket.onopen = () => {
        console.log("Connected to PocketOption WebSocket");
        
        // Send authentication with SSID
        if (poSocket && credentials.pocketoption_ssid) {
          poSocket.send(credentials.pocketoption_ssid);
          
          // Send to client
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ 
              type: 'connection', 
              status: 'connected',
              message: 'Connected to PocketOption'
            }));
          }
        }

        isConnected = true;

        // Start heartbeat
        heartbeatInterval = setInterval(() => {
          if (poSocket?.readyState === WebSocket.OPEN) {
            poSocket.send('2'); // Socket.io heartbeat
          }
        }, 25000);
      };

      poSocket.onmessage = (event) => {
        console.log("Received from PocketOption:", event.data);
        
        // Forward to client
        if (socket.readyState === WebSocket.OPEN) {
          try {
            const data = event.data;
            
            // Handle Socket.io protocol
            if (typeof data === 'string') {
              if (data === '0') {
                // Connection established
                socket.send(JSON.stringify({ type: 'po_connected' }));
              } else if (data === '40') {
                // Ready for messages
                socket.send(JSON.stringify({ type: 'po_ready' }));
              } else if (data.startsWith('42')) {
                // Actual data message
                const jsonData = data.substring(2);
                socket.send(JSON.stringify({ 
                  type: 'po_data',
                  data: JSON.parse(jsonData)
                }));
              } else {
                // Forward raw data
                socket.send(JSON.stringify({ 
                  type: 'po_message',
                  data: data
                }));
              }
            }
          } catch (error) {
            console.error("Error processing PocketOption message:", error);
          }
        }
      };

      poSocket.onerror = (error) => {
        console.error("PocketOption WebSocket error:", error);
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ 
            type: 'error',
            message: 'PocketOption connection error'
          }));
        }
      };

      poSocket.onclose = () => {
        console.log("PocketOption WebSocket closed");
        isConnected = false;
        
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }

        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ 
            type: 'connection',
            status: 'disconnected',
            message: 'Disconnected from PocketOption'
          }));
        }
      };
    } catch (error) {
      console.error("Error connecting to PocketOption:", error);
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ 
          type: 'error',
          message: error.message
        }));
      }
    }
  };

  // Handle messages from client
  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log("Received from client:", message);

      if (message.type === 'connect') {
        connectToPocketOption();
      } else if (message.type === 'trade') {
        // Forward trade command to PocketOption
        if (poSocket && isConnected) {
          const tradeCommand = `42${JSON.stringify(['trade', {
            asset: message.asset,
            action: message.action, // "call" or "put"
            amount: message.amount,
            time: message.duration
          }])}`;
          
          poSocket.send(tradeCommand);
          console.log("Sent trade command:", tradeCommand);
        } else {
          socket.send(JSON.stringify({ 
            type: 'error',
            message: 'Not connected to PocketOption'
          }));
        }
      } else if (message.type === 'get_balance') {
        // Request balance
        if (poSocket && isConnected) {
          poSocket.send(`42${JSON.stringify(['balance'])}`);
        }
      } else if (message.type === 'change_balance') {
        // Switch between demo/real
        if (poSocket && isConnected) {
          const mode = message.mode === 'demo' ? 'PRACTICE' : 'REAL';
          poSocket.send(`42${JSON.stringify(['changeBalance', mode])}`);
        }
      } else if (message.type === 'subscribe_candles') {
        // Subscribe to price updates for an asset
        if (poSocket && isConnected) {
          poSocket.send(`42${JSON.stringify(['subscribeCandles', message.asset])}`);
        }
      }
    } catch (error) {
      console.error("Error handling client message:", error);
    }
  };

  socket.onclose = () => {
    console.log("Client WebSocket closed");
    
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    
    if (poSocket) {
      poSocket.close();
    }
  };

  socket.onerror = (error) => {
    console.error("Client WebSocket error:", error);
  };

  // MUST return response synchronously
  return response;
});
