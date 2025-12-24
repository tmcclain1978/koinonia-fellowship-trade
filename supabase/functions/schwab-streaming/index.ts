import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Decryption helper
async function getEncryptionKey(): Promise<CryptoKey> {
  const ENCRYPTION_KEY_B64 = Deno.env.get("CREDENTIALS_ENCRYPTION_KEY");
  let keyData: Uint8Array;
  
  if (!ENCRYPTION_KEY_B64) {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const encoder = new TextEncoder();
    const data = encoder.encode(serviceKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    keyData = new Uint8Array(hashBuffer);
  } else {
    try {
      keyData = Uint8Array.from(atob(ENCRYPTION_KEY_B64), c => c.charCodeAt(0));
      if (keyData.length !== 32) {
        throw new Error("Invalid key length");
      }
    } catch (error) {
      const encoder = new TextEncoder();
      const data = encoder.encode(ENCRYPTION_KEY_B64);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      keyData = new Uint8Array(hashBuffer);
    }
  }
  
  return await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function decryptText(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}

async function getAccessToken(authHeader: string): Promise<{ accessToken: string; preferences: any }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  
  // Get access token from schwab-get-access-token function
  const tokenResponse = await fetch(`${supabaseUrl}/functions/v1/schwab-get-access-token`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });
  
  if (!tokenResponse.ok) {
    throw new Error('Failed to get access token');
  }
  
  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error('No access token returned');
  }
  
  // Get user preferences with streaming info
  const prefsResponse = await fetch(`${supabaseUrl}/functions/v1/schwab-accounts`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'preferences' }),
  });
  
  let preferences = null;
  if (prefsResponse.ok) {
    const prefsData = await prefsResponse.json();
    preferences = prefsData.data;
  }
  
  return { accessToken: tokenData.access_token, preferences };
}

serve(async (req) => {
  // Handle WebSocket upgrade
  const upgradeHeader = req.headers.get("upgrade") || "";
  
  if (upgradeHeader.toLowerCase() === "websocket") {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401 });
    }
    
    try {
      const { accessToken, preferences } = await getAccessToken(authHeader);
      
      const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
      
      // Connect to Schwab Streaming API
      // Schwab uses wss://streamer-api.schwab.com for streaming
      const schwabStreamUrl = 'wss://streamer-api.schwab.com/ws';
      let schwabSocket: WebSocket | null = null;
      let isAuthenticated = false;
      
      clientSocket.onopen = () => {
        console.log('[schwab-streaming] Client connected');
        
        // Connect to Schwab streaming
        schwabSocket = new WebSocket(schwabStreamUrl);
        
        schwabSocket.onopen = () => {
          console.log('[schwab-streaming] Connected to Schwab streamer');
          
          // Send login request
          const loginRequest = {
            requests: [{
              service: "ADMIN",
              command: "LOGIN",
              requestid: "0",
              SchwabClientCustomerId: preferences?.streamerInfo?.schwabClientCustomerId || "",
              SchwabClientCorrelId: preferences?.streamerInfo?.schwabClientCorrelId || "",
              parameters: {
                Authorization: accessToken,
                SchwabClientChannel: preferences?.streamerInfo?.schwabClientChannel || "client",
                SchwabClientFunctionId: preferences?.streamerInfo?.schwabClientFunctionId || "DEFAULT",
              },
            }],
          };
          
          schwabSocket!.send(JSON.stringify(loginRequest));
        };
        
        schwabSocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[schwab-streaming] Received from Schwab:', JSON.stringify(data).substring(0, 200));
            
            // Check for login response
            if (data.response) {
              for (const resp of data.response) {
                if (resp.service === "ADMIN" && resp.command === "LOGIN") {
                  if (resp.content?.code === 0) {
                    isAuthenticated = true;
                    console.log('[schwab-streaming] Authenticated with Schwab streamer');
                    clientSocket.send(JSON.stringify({ type: 'connected', message: 'Schwab streaming connected' }));
                  } else {
                    console.error('[schwab-streaming] Auth failed:', resp.content);
                    clientSocket.send(JSON.stringify({ type: 'error', message: 'Schwab streaming authentication failed' }));
                  }
                }
              }
            }
            
            // Forward data to client
            if (data.data) {
              for (const item of data.data) {
                clientSocket.send(JSON.stringify({
                  type: 'data',
                  service: item.service,
                  content: item.content,
                }));
              }
            }
            
            // Forward notify messages
            if (data.notify) {
              clientSocket.send(JSON.stringify({
                type: 'notify',
                content: data.notify,
              }));
            }
          } catch (error) {
            console.error('[schwab-streaming] Parse error:', error);
          }
        };
        
        schwabSocket.onerror = (error) => {
          console.error('[schwab-streaming] Schwab socket error:', error);
          clientSocket.send(JSON.stringify({ type: 'error', message: 'Schwab streaming error' }));
        };
        
        schwabSocket.onclose = () => {
          console.log('[schwab-streaming] Schwab socket closed');
          clientSocket.send(JSON.stringify({ type: 'disconnected', message: 'Schwab streaming disconnected' }));
        };
      };
      
      clientSocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[schwab-streaming] Client message:', message);
          
          if (!schwabSocket || schwabSocket.readyState !== WebSocket.OPEN) {
            clientSocket.send(JSON.stringify({ type: 'error', message: 'Not connected to Schwab' }));
            return;
          }
          
          if (!isAuthenticated) {
            clientSocket.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
            return;
          }
          
          // Handle subscription requests
          if (message.action === 'subscribe') {
            const subscribeRequest = {
              requests: [{
                service: message.service || "QUOTE",
                command: "SUBS",
                requestid: String(Date.now()),
                SchwabClientCustomerId: preferences?.streamerInfo?.schwabClientCustomerId || "",
                SchwabClientCorrelId: preferences?.streamerInfo?.schwabClientCorrelId || "",
                parameters: {
                  keys: message.symbols?.join(',') || "",
                  fields: message.fields || "0,1,2,3,4,5,6,7,8,9,10",
                },
              }],
            };
            schwabSocket.send(JSON.stringify(subscribeRequest));
          }
          
          // Handle account activity subscription
          if (message.action === 'subscribe_account') {
            const accountRequest = {
              requests: [{
                service: "ACCT_ACTIVITY",
                command: "SUBS",
                requestid: String(Date.now()),
                SchwabClientCustomerId: preferences?.streamerInfo?.schwabClientCustomerId || "",
                SchwabClientCorrelId: preferences?.streamerInfo?.schwabClientCorrelId || "",
                parameters: {
                  keys: preferences?.accounts?.[0]?.accountNumber || "",
                  fields: "0,1,2,3",
                },
              }],
            };
            schwabSocket.send(JSON.stringify(accountRequest));
          }
          
          // Handle order updates subscription
          if (message.action === 'subscribe_orders') {
            const orderRequest = {
              requests: [{
                service: "LEVELONE_EQUITIES",
                command: "SUBS",
                requestid: String(Date.now()),
                SchwabClientCustomerId: preferences?.streamerInfo?.schwabClientCustomerId || "",
                SchwabClientCorrelId: preferences?.streamerInfo?.schwabClientCorrelId || "",
                parameters: {
                  keys: message.symbols?.join(',') || "",
                  fields: "0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15",
                },
              }],
            };
            schwabSocket.send(JSON.stringify(orderRequest));
          }
          
          // Handle unsubscribe
          if (message.action === 'unsubscribe') {
            const unsubRequest = {
              requests: [{
                service: message.service || "QUOTE",
                command: "UNSUBS",
                requestid: String(Date.now()),
                SchwabClientCustomerId: preferences?.streamerInfo?.schwabClientCustomerId || "",
                SchwabClientCorrelId: preferences?.streamerInfo?.schwabClientCorrelId || "",
                parameters: {
                  keys: message.symbols?.join(',') || "",
                },
              }],
            };
            schwabSocket.send(JSON.stringify(unsubRequest));
          }
        } catch (error) {
          console.error('[schwab-streaming] Client message error:', error);
        }
      };
      
      clientSocket.onclose = () => {
        console.log('[schwab-streaming] Client disconnected');
        if (schwabSocket && schwabSocket.readyState === WebSocket.OPEN) {
          // Send logout before closing
          const logoutRequest = {
            requests: [{
              service: "ADMIN",
              command: "LOGOUT",
              requestid: String(Date.now()),
              SchwabClientCustomerId: preferences?.streamerInfo?.schwabClientCustomerId || "",
              SchwabClientCorrelId: preferences?.streamerInfo?.schwabClientCorrelId || "",
              parameters: {},
            }],
          };
          schwabSocket.send(JSON.stringify(logoutRequest));
          schwabSocket.close();
        }
      };
      
      clientSocket.onerror = (error) => {
        console.error('[schwab-streaming] Client socket error:', error);
      };
      
      return response;
    } catch (error) {
      console.error('[schwab-streaming] Upgrade error:', error);
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
  }
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Return info for non-WebSocket requests
  return new Response(
    JSON.stringify({ 
      message: 'Schwab Streaming WebSocket endpoint',
      usage: 'Connect via WebSocket with Authorization header',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
