import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, upgrade, connection',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const upgradeHeader = req.headers.get("upgrade") || "";
  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { 
      status: 400,
      headers: corsHeaders 
    });
  }

  // CRITICAL: Authenticate BEFORE upgrading the WebSocket
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    console.error("No authentication token provided in query params");
    return new Response("Auth token not provided", { 
      status: 403,
      headers: corsHeaders 
    });
  }

  console.log("WebSocket upgrade request received, verifying token...");

  // Use service role to verify user and fetch credentials
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Verify the JWT token
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  
  if (authError || !user) {
    console.error("Authentication failed:", authError?.message || "No user found");
    return new Response("Invalid or expired token", { 
      status: 403,
      headers: corsHeaders 
    });
  }

  console.log("User authenticated:", user.id);

  // Fetch credentials BEFORE upgrading
  const { data: creds, error: credError } = await supabase
    .from('user_api_credentials')
    .select('pocketoption_ssid')
    .eq('user_id', user.id)
    .single();

  if (credError || !creds?.pocketoption_ssid) {
    console.error("PocketOption credentials not found:", credError?.message);
    return new Response("PocketOption credentials not found. Please save your SSID first.", { 
      status: 400,
      headers: corsHeaders 
    });
  }

  console.log("Credentials verified, upgrading to WebSocket...");

  // NOW safe to upgrade - auth is complete
  const { socket, response } = Deno.upgradeWebSocket(req);
  
  // Set up WebSocket handlers with credentials available via closure
  let poSocket: WebSocket | null = null;
  let isConnected = false;
  let heartbeatInterval: number | null = null;
  const ssid = creds.pocketoption_ssid;

  socket.onopen = () => {
    console.log("Client WebSocket opened, ready to connect to PocketOption");
    
    // Send ready message to client
    socket.send(JSON.stringify({ 
      type: 'authenticated',
      message: 'Ready to connect to PocketOption'
    }));
  };

  // Connect to PocketOption WebSocket
  const connectToPocketOption = () => {
    try {
      console.log("Connecting to PocketOption WebSocket...");
      
      // PocketOption WebSocket endpoint
      poSocket = new WebSocket("wss://platform44.po2.capital/socket.io/?EIO=3&transport=websocket");

      poSocket.onopen = () => {
        console.log("Connected to PocketOption WebSocket");
        
        // Send authentication with SSID
        if (poSocket && ssid) {
          poSocket.send(ssid);
          console.log("Sent SSID authentication to PocketOption");
          
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
                try {
                  const jsonData = data.substring(2);
                  socket.send(JSON.stringify({ 
                    type: 'po_data',
                    data: JSON.parse(jsonData)
                  }));
                } catch {
                  socket.send(JSON.stringify({ 
                    type: 'po_message',
                    data: data
                  }));
                }
              } else if (data !== '3') { // Ignore heartbeat responses
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
          message: error instanceof Error ? error.message : 'Connection failed'
        }));
      }
    }
  };

  // Handle messages from client
  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log("Received from client:", message.type);

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
          console.log("Sent trade command");
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

  // Return the WebSocket response
  return response;
});
