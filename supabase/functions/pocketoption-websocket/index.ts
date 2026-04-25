import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { safeDecrypt } from "../_shared/encryption.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, upgrade, connection',
};

// PocketOption WebSocket endpoints - prioritize regional endpoints
const PO_ENDPOINTS = [
  // Regional endpoints (most common)
  "wss://api-eu.po.market/socket.io/?EIO=4&transport=websocket",
  "wss://api-in.po.market/socket.io/?EIO=4&transport=websocket",
  "wss://api-us.po.market/socket.io/?EIO=4&transport=websocket",
  "wss://api-v2.po.market/socket.io/?EIO=4&transport=websocket",
  // Demo endpoints
  "wss://demo-api-v2.po.market/socket.io/?EIO=4&transport=websocket",
  "wss://demo-api-eu.po.market/socket.io/?EIO=4&transport=websocket",
  // Platform endpoints (alternative routing)
  "wss://platform44.po2.capital/socket.io/?EIO=4&transport=websocket",
  "wss://platform32.po2.capital/socket.io/?EIO=4&transport=websocket",
  // Legacy endpoints
  "wss://pocketoption.com/socket.io/?EIO=4&transport=websocket",
  "wss://demo.pocketoption.com/socket.io/?EIO=4&transport=websocket",
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
  let isAuthenticated = false;
  let heartbeatInterval: number | null = null;
  let currentEndpointIndex = 0;
  let connectionAttempts = 0;
  const ssid = (await safeDecrypt(creds.pocketoption_ssid)) as string;

  // Parse SSID to extract auth data - improved to handle all formats
  const parseSSID = (ssidString: string): { session: string; isDemo: number; uid: string } | null => {
    try {
      console.log("Parsing SSID format...");
      
      // Remove whitespace
      const trimmed = ssidString.trim();
      
      // Format 1: 42["auth",{"session":"...","isDemo":0,"uid":"123"}]
      if (trimmed.startsWith('42["auth",')) {
        const jsonPart = trimmed.substring(10, trimmed.length - 1);
        const parsed = JSON.parse(jsonPart);
        console.log("Parsed auth format - isDemo:", parsed.isDemo, "uid:", parsed.uid);
        return {
          session: parsed.session || parsed.secret || "",
          isDemo: typeof parsed.isDemo === 'number' ? parsed.isDemo : (parsed.isDemo ? 1 : 0),
          uid: String(parsed.uid || parsed.id || "")
        };
      }
      
      // Format 2: 42["user_init",{"secret":"...","isDemo":false,"id":123}]
      if (trimmed.startsWith('42["user_init",')) {
        const jsonPart = trimmed.substring(15, trimmed.length - 1);
        const parsed = JSON.parse(jsonPart);
        console.log("Parsed user_init format - isDemo:", parsed.isDemo, "id:", parsed.id);
        return {
          session: parsed.secret || parsed.session || "",
          isDemo: parsed.isDemo === true || parsed.isDemo === 1 ? 1 : 0,
          uid: String(parsed.id || parsed.uid || "")
        };
      }
      
      // Format 3: Just the JSON object {"session":"...","isDemo":0}
      if (trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed);
        console.log("Parsed JSON object format");
        return {
          session: parsed.session || parsed.secret || "",
          isDemo: typeof parsed.isDemo === 'number' ? parsed.isDemo : (parsed.isDemo ? 1 : 0),
          uid: String(parsed.uid || parsed.id || "")
        };
      }
      
      // Format 4: Raw session token string
      console.log("Treating as raw session token");
      return {
        session: trimmed,
        isDemo: 0, // Default to REAL for raw tokens
        uid: ""
      };
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

  // Connect to PocketOption WebSocket with improved retry logic
  const connectToPocketOption = () => {
    const authData = parseSSID(ssid);
    if (!authData) {
      socket.send(JSON.stringify({ 
        type: 'error',
        message: 'Invalid SSID format. Please check your credentials.'
      }));
      return;
    }

    console.log("Auth data parsed - isDemo:", authData.isDemo, "uid:", authData.uid ? "present" : "empty");

    const tryConnect = (endpointIndex: number) => {
      connectionAttempts++;
      
      if (endpointIndex >= PO_ENDPOINTS.length) {
        console.error("All PocketOption endpoints failed after", connectionAttempts, "attempts");
        socket.send(JSON.stringify({ 
          type: 'error',
          message: `Could not connect to PocketOption. Tried ${PO_ENDPOINTS.length} endpoints. Your region may use a different server.`,
          details: {
            attemptedEndpoints: PO_ENDPOINTS.length,
            suggestion: "Check your browser DevTools Network tab for the WebSocket URL and report it."
          }
        }));
        return;
      }

      const endpoint = PO_ENDPOINTS[endpointIndex];
      console.log(`[Attempt ${connectionAttempts}] Trying endpoint ${endpointIndex + 1}/${PO_ENDPOINTS.length}: ${endpoint}`);

      // Notify client of connection attempt
      socket.send(JSON.stringify({
        type: 'connection_attempt',
        endpoint: endpoint.replace(/wss?:\/\/([^\/]+).*/, '$1'),
        attemptNumber: endpointIndex + 1,
        totalEndpoints: PO_ENDPOINTS.length
      }));

      try {
        poSocket = new WebSocket(endpoint);

        // Increase timeout for slower connections
        const connectionTimeout = setTimeout(() => {
          if (poSocket && poSocket.readyState !== WebSocket.OPEN) {
            console.log("Connection timeout on endpoint", endpointIndex + 1);
            poSocket.close();
            
            // Exponential backoff delay before next attempt
            const delay = Math.min(500 * Math.pow(1.5, endpointIndex), 3000);
            console.log(`Waiting ${delay}ms before next endpoint...`);
            setTimeout(() => tryConnect(endpointIndex + 1), delay);
          }
        }, 8000); // Increased from 5s to 8s

        poSocket.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log("Connected to PocketOption WebSocket:", endpoint);
          currentEndpointIndex = endpointIndex;
          
          // Socket.io v4 expects the client to wait for the server's handshake
          // The server will send "0{...}" first
        };

        poSocket.onmessage = (event) => {
          const data = event.data;
          const preview = typeof data === 'string' ? data.substring(0, 150) : 'binary';
          console.log("PO message:", preview);
          
          if (typeof data === 'string') {
            // Socket.io v4 protocol
            if (data.startsWith('0{')) {
              // Server handshake - respond with namespace connection
              console.log("Received Socket.io handshake, sending namespace connection...");
              poSocket?.send('40');
            } else if (data === '2') {
              // Ping - respond with pong
              poSocket?.send('3');
            } else if (data === '40') {
              // Connected to namespace, now authenticate
              console.log("Connected to Socket.io namespace, sending auth...");
              isConnected = true;
              
              // Send authentication with correct isDemo value
              const authPayload = {
                session: authData.session,
                isDemo: authData.isDemo,
                uid: authData.uid,
                platform: 2
              };
              
              const authMessage = `42["auth",${JSON.stringify(authPayload)}]`;
              console.log("Sending auth - isDemo:", authData.isDemo);
              poSocket?.send(authMessage);
              
              // Start heartbeat (ping every 25 seconds to match Socket.io default)
              heartbeatInterval = setInterval(() => {
                if (poSocket?.readyState === WebSocket.OPEN) {
                  poSocket.send('2');
                }
              }, 25000);
              
              socket.send(JSON.stringify({ 
                type: 'connection', 
                status: 'connected',
                endpoint: endpoint.replace(/wss?:\/\/([^\/]+).*/, '$1'),
                message: 'Connected to PocketOption, authenticating...'
              }));
            } else if (data.startsWith('42')) {
              // Data message
              try {
                const jsonStr = data.substring(2);
                const parsed = JSON.parse(jsonStr);
                const eventName = parsed[0];
                const eventData = parsed[1];
                
                if (eventName === 'successauth') {
                  console.log("Successfully authenticated with PocketOption!");
                  isAuthenticated = true;
                  socket.send(JSON.stringify({ 
                    type: 'po_authenticated',
                    data: eventData
                  }));
                } else if (eventName === 'failauth' || eventName === 'authFail') {
                  console.error("Authentication failed with PocketOption:", eventData);
                  socket.send(JSON.stringify({ 
                    type: 'error',
                    message: 'PocketOption authentication failed. Your SSID may be expired.',
                    code: 'AUTH_FAILED'
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
                } else if (eventName === 'openOrder') {
                  socket.send(JSON.stringify({ 
                    type: 'po_order',
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
              // Pong response - connection is alive
              console.log("Heartbeat pong received");
            } else if (data.startsWith('44')) {
              // Error message from server
              console.error("PocketOption error:", data);
              socket.send(JSON.stringify({ 
                type: 'error',
                message: 'PocketOption rejected the request',
                raw: data
              }));
            } else if (data === '41') {
              // Namespace disconnect
              console.log("PocketOption namespace disconnected");
              isConnected = false;
              isAuthenticated = false;
            }
          }
        };

        poSocket.onerror = (error) => {
          clearTimeout(connectionTimeout);
          console.error("PocketOption WebSocket error on endpoint", endpoint);
          
          // Try next endpoint if not yet connected
          if (!isConnected) {
            const delay = Math.min(300 * Math.pow(1.5, endpointIndex), 2000);
            setTimeout(() => tryConnect(endpointIndex + 1), delay);
          } else {
            socket.send(JSON.stringify({ 
              type: 'error',
              message: 'PocketOption connection error after initial connect'
            }));
          }
        };

        poSocket.onclose = (event) => {
          clearTimeout(connectionTimeout);
          console.log("PocketOption WebSocket closed - code:", event.code, "reason:", event.reason);
          
          const wasConnected = isConnected;
          isConnected = false;
          isAuthenticated = false;
          
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }

          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ 
              type: 'connection',
              status: 'disconnected',
              message: 'Disconnected from PocketOption',
              closeCode: event.code,
              wasAuthenticated: wasConnected
            }));
          }
        };
      } catch (error) {
        console.error("Error creating WebSocket:", error);
        const delay = Math.min(300 * Math.pow(1.5, endpointIndex), 2000);
        setTimeout(() => tryConnect(endpointIndex + 1), delay);
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
        if (poSocket && isConnected && isAuthenticated) {
          const tradePayload = {
            asset: message.asset,
            amount: message.amount,
            action: message.action, // "call" or "put"
            isDemo: message.isDemo ?? 0, // Default to REAL
            optionType: 100, // turbo option
            time: message.duration || 60
          };
          
          const tradeMessage = `42["openOrder",${JSON.stringify(tradePayload)}]`;
          console.log("Sending trade command:", tradePayload.asset, tradePayload.action, tradePayload.amount);
          poSocket.send(tradeMessage);
        } else {
          socket.send(JSON.stringify({ 
            type: 'error',
            message: isConnected ? 'Not authenticated with PocketOption' : 'Not connected to PocketOption'
          }));
        }
      } else if (message.type === 'get_balance') {
        if (poSocket && isConnected) {
          poSocket.send('42["getBalance"]');
        }
      } else if (message.type === 'change_balance') {
        if (poSocket && isConnected) {
          const isDemo = message.mode === 'demo' ? 1 : 0;
          poSocket.send(`42["changeSymbol",${JSON.stringify({ isDemo })}]`);
        }
      } else if (message.type === 'subscribe_candles') {
        if (poSocket && isConnected) {
          // Subscribe to asset updates
          const asset = message.asset || 'EURUSD_otc';
          console.log("Subscribing to candles for:", asset);
          poSocket.send(`42["subscribeSymbol","${asset}"]`);
          poSocket.send(`42["changeSymbol",${JSON.stringify({
            asset: asset,
            period: 60
          })}]`);
        }
      } else if (message.type === 'ping') {
        // Keep-alive ping from client
        socket.send(JSON.stringify({ type: 'pong' }));
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
