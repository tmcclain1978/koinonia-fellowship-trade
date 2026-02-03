import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, upgrade, connection',
};

// PocketOption WebSocket endpoints by region
const PO_ENDPOINTS = [
  "wss://demo-api-v2.po.market/socket.io/?EIO=4&transport=websocket",
  "wss://api-v2.po.market/socket.io/?EIO=4&transport=websocket",
  "wss://demo.pocketoption.com/socket.io/?EIO=4&transport=websocket",
  "wss://pocketoption.com/socket.io/?EIO=4&transport=websocket",
];

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
  let currentEndpointIndex = 0;
  const ssid = creds.pocketoption_ssid;

  // Parse SSID to extract auth data
  const parseSSID = (ssidString: string): { session: string; isDemo: number; uid: string } | null => {
    try {
      // SSID format: 42["auth",{"session":"...","isDemo":1,"uid":"123"}]
      // Or just the session string
      if (ssidString.startsWith('42["auth",')) {
        const jsonPart = ssidString.substring(10, ssidString.length - 1);
        return JSON.parse(jsonPart);
      } else if (ssidString.startsWith('42["user_init",')) {
        const jsonPart = ssidString.substring(15, ssidString.length - 1);
        const data = JSON.parse(jsonPart);
        return {
          session: data.secret || data.session || ssidString,
          isDemo: data.isDemo ? 1 : 0,
          uid: String(data.id || data.uid || "")
        };
      } else {
        // Assume it's a raw session token
        return {
          session: ssidString,
          isDemo: 1, // Default to demo
          uid: ""
        };
      }
    } catch (e) {
      console.error("Failed to parse SSID:", e);
      return null;
    }
  };

  socket.onopen = () => {
    console.log("Client WebSocket opened, ready to connect to PocketOption");
    
    // Send ready message to client
    socket.send(JSON.stringify({ 
      type: 'authenticated',
      message: 'Ready to connect to PocketOption'
    }));
  };

  // Connect to PocketOption WebSocket with retry logic
  const connectToPocketOption = () => {
    const authData = parseSSID(ssid);
    if (!authData) {
      socket.send(JSON.stringify({ 
        type: 'error',
        message: 'Invalid SSID format. Please check your credentials.'
      }));
      return;
    }

    const tryConnect = (endpointIndex: number) => {
      if (endpointIndex >= PO_ENDPOINTS.length) {
        console.error("All PocketOption endpoints failed");
        socket.send(JSON.stringify({ 
          type: 'error',
          message: 'Could not connect to PocketOption. All endpoints failed.'
        }));
        return;
      }

      const endpoint = PO_ENDPOINTS[endpointIndex];
      console.log(`Trying PocketOption endpoint ${endpointIndex + 1}/${PO_ENDPOINTS.length}: ${endpoint}`);

      try {
        poSocket = new WebSocket(endpoint);

        const connectionTimeout = setTimeout(() => {
          if (poSocket && poSocket.readyState !== WebSocket.OPEN) {
            console.log("Connection timeout, trying next endpoint...");
            poSocket.close();
            tryConnect(endpointIndex + 1);
          }
        }, 5000);

        poSocket.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log("Connected to PocketOption WebSocket:", endpoint);
          currentEndpointIndex = endpointIndex;
          
          // Socket.io v4 expects the client to wait for the server's handshake
          // The server will send "0{...}" first
        };

        poSocket.onmessage = (event) => {
          const data = event.data;
          console.log("PO message:", typeof data === 'string' ? data.substring(0, 100) : 'binary');
          
          if (typeof data === 'string') {
            // Socket.io v4 protocol
            if (data.startsWith('0{')) {
              // Server handshake - respond with session upgrade
              console.log("Received Socket.io handshake");
              poSocket?.send('40');
            } else if (data === '2') {
              // Ping - respond with pong
              poSocket?.send('3');
            } else if (data === '40') {
              // Connected to namespace, now authenticate
              console.log("Connected to Socket.io namespace, sending auth...");
              
              // Send authentication
              const authMessage = `42["auth",${JSON.stringify({
                session: authData.session,
                isDemo: authData.isDemo,
                uid: authData.uid,
                platform: 2
              })}]`;
              
              console.log("Sending auth message");
              poSocket?.send(authMessage);
              
              isConnected = true;
              
              // Start heartbeat (ping every 25 seconds)
              heartbeatInterval = setInterval(() => {
                if (poSocket?.readyState === WebSocket.OPEN) {
                  poSocket.send('2');
                }
              }, 25000);
              
              socket.send(JSON.stringify({ 
                type: 'connection', 
                status: 'connected',
                message: 'Connected to PocketOption'
              }));
            } else if (data.startsWith('42')) {
              // Data message
              try {
                const jsonStr = data.substring(2);
                const parsed = JSON.parse(jsonStr);
                const eventName = parsed[0];
                const eventData = parsed[1];
                
                if (eventName === 'successauth') {
                  console.log("Successfully authenticated with PocketOption");
                  socket.send(JSON.stringify({ 
                    type: 'po_authenticated',
                    data: eventData
                  }));
                } else if (eventName === 'updateStream' || eventName === 'candles') {
                  // Forward candle/price data
                  socket.send(JSON.stringify({ 
                    type: 'po_candles',
                    data: eventData
                  }));
                } else if (eventName === 'balance') {
                  socket.send(JSON.stringify({ 
                    type: 'po_balance',
                    data: eventData
                  }));
                } else if (eventName === 'deals') {
                  socket.send(JSON.stringify({ 
                    type: 'po_deals',
                    data: eventData
                  }));
                } else {
                  // Forward other events
                  socket.send(JSON.stringify({ 
                    type: 'po_data',
                    event: eventName,
                    data: eventData
                  }));
                }
              } catch (e) {
                console.error("Failed to parse PO message:", e);
              }
            } else if (data === '3') {
              // Pong response - ignore
            } else if (data.startsWith('44')) {
              // Error message from server
              console.error("PocketOption error:", data);
              socket.send(JSON.stringify({ 
                type: 'error',
                message: 'PocketOption rejected the request'
              }));
            }
          }

          // Forward to client if open
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ 
              type: 'po_raw',
              data: data
            }));
          }
        };

        poSocket.onerror = (error) => {
          clearTimeout(connectionTimeout);
          console.error("PocketOption WebSocket error on endpoint", endpoint);
          
          // Try next endpoint
          if (!isConnected) {
            tryConnect(endpointIndex + 1);
          } else {
            socket.send(JSON.stringify({ 
              type: 'error',
              message: 'PocketOption connection error'
            }));
          }
        };

        poSocket.onclose = () => {
          clearTimeout(connectionTimeout);
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
        console.error("Error creating WebSocket:", error);
        tryConnect(endpointIndex + 1);
      }
    };

    tryConnect(0);
  };

  // Handle messages from client
  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log("Client message:", message.type);

      if (message.type === 'connect') {
        connectToPocketOption();
      } else if (message.type === 'trade') {
        // Forward trade command to PocketOption
        if (poSocket && isConnected) {
          const tradeMessage = `42["openOrder",${JSON.stringify({
            asset: message.asset,
            amount: message.amount,
            action: message.action, // "call" or "put"
            isDemo: message.isDemo ?? 1,
            optionType: 100, // turbo option
            time: message.duration || 60
          })}]`;
          
          poSocket.send(tradeMessage);
          console.log("Sent trade command");
        } else {
          socket.send(JSON.stringify({ 
            type: 'error',
            message: 'Not connected to PocketOption'
          }));
        }
      } else if (message.type === 'get_balance') {
        if (poSocket && isConnected) {
          poSocket.send('42["getBalance"]');
        }
      } else if (message.type === 'change_balance') {
        if (poSocket && isConnected) {
          poSocket.send(`42["changeSymbol",${JSON.stringify({
            isDemo: message.mode === 'demo' ? 1 : 0
          })}]`);
        }
      } else if (message.type === 'subscribe_candles') {
        if (poSocket && isConnected) {
          // Subscribe to asset updates
          const asset = message.asset || 'EURUSD_otc';
          poSocket.send(`42["subscribeSymbol","${asset}"]`);
          poSocket.send(`42["changeSymbol",${JSON.stringify({
            asset: asset,
            period: 60
          })}]`);
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
