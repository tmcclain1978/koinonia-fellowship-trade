import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Encryption key from environment (base64 encoded)
const ENCRYPTION_KEY_B64 = Deno.env.get("CREDENTIALS_ENCRYPTION_KEY");

async function getEncryptionKey(): Promise<CryptoKey> {
  let keyData: Uint8Array;
  
  if (!ENCRYPTION_KEY_B64) {
    // Generate a deterministic key from the Supabase service role key
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
      console.warn("Invalid encryption key format, using fallback");
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

async function encryptText(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return btoa(String.fromCharCode(...combined));
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      throw new Error("Invalid user token");
    }

    const { operation, credentials } = await req.json();

    if (operation === "save") {
      const nowIso = new Date().toISOString();

      // Encrypt and save credentials for ALL brokers
      const encryptedData: any = {
        user_id: user.id,
        broker_type: credentials.broker_type,
        trading_mode: credentials.trading_mode || "paper",
        updated_at: nowIso,
      };

      // Schwab credentials
      if (credentials.schwab_client_id) {
        encryptedData.schwab_client_id = await encryptText(credentials.schwab_client_id);
      }
      if (credentials.schwab_client_secret) {
        encryptedData.schwab_client_secret = await encryptText(credentials.schwab_client_secret);
      }
      if (credentials.schwab_refresh_token) {
        encryptedData.schwab_refresh_token = await encryptText(credentials.schwab_refresh_token);
      }

      // TD Ameritrade credentials (deprecated but keep for migration)
      if (credentials.td_client_id) {
        encryptedData.td_client_id = await encryptText(credentials.td_client_id);
      }
      if (credentials.td_client_secret) {
        encryptedData.td_client_secret = await encryptText(credentials.td_client_secret);
      }

      // E*TRADE credentials
      if (credentials.etrade_consumer_key) {
        encryptedData.etrade_consumer_key = await encryptText(credentials.etrade_consumer_key);
      }
      if (credentials.etrade_consumer_secret) {
        encryptedData.etrade_consumer_secret = await encryptText(credentials.etrade_consumer_secret);
      }

      // Alpaca credentials
      if (credentials.alpaca_api_key) {
        encryptedData.alpaca_api_key = await encryptText(credentials.alpaca_api_key);
      }
      if (credentials.alpaca_secret_key) {
        encryptedData.alpaca_secret_key = await encryptText(credentials.alpaca_secret_key);
      }
      // Boolean - doesn't need encryption
      if (credentials.alpaca_paper_mode !== undefined) {
        encryptedData.alpaca_paper_mode = credentials.alpaca_paper_mode;
      }

      // Interactive Brokers credentials
      if (credentials.ib_account_id) {
        encryptedData.ib_account_id = await encryptText(credentials.ib_account_id);
      }
      if (credentials.ib_access_token) {
        encryptedData.ib_access_token = await encryptText(credentials.ib_access_token);
      }

      const { error } = await supabase
        .from("user_api_credentials")
        .upsert(encryptedData, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error("Error saving credentials:", error);
        throw new Error("Failed to save credentials");
      }

      return new Response(
        JSON.stringify({ success: true, message: "Credentials encrypted and saved" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (operation === "load") {
      // Load and decrypt credentials
      const { data, error } = await supabase
        .from("user_api_credentials")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error loading credentials:", error);
        throw new Error("Failed to load credentials");
      }

      if (!data) {
        return new Response(
          JSON.stringify({ credentials: null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const safeDecrypt = async (value: string | null) => {
        if (!value) return null;
        try {
          return await decryptText(value);
        } catch (e) {
          console.warn("[encrypt-credentials] Could not decrypt value, returning as-is");
          return value;
        }
      };

      const decryptedData: any = {
        trading_mode: data.trading_mode,
        broker_type: data.broker_type,
        // Boolean fields - no decryption needed
        alpaca_paper_mode: data.alpaca_paper_mode,
      };

      // Schwab
      decryptedData.schwab_client_id = await safeDecrypt(data.schwab_client_id);
      decryptedData.schwab_client_secret = await safeDecrypt(data.schwab_client_secret);
      decryptedData.schwab_refresh_token = await safeDecrypt(data.schwab_refresh_token);

      // TD Ameritrade
      decryptedData.td_client_id = await safeDecrypt(data.td_client_id);
      decryptedData.td_client_secret = await safeDecrypt(data.td_client_secret);

      // E*TRADE
      decryptedData.etrade_consumer_key = await safeDecrypt(data.etrade_consumer_key);
      decryptedData.etrade_consumer_secret = await safeDecrypt(data.etrade_consumer_secret);

      // Alpaca
      decryptedData.alpaca_api_key = await safeDecrypt(data.alpaca_api_key);
      decryptedData.alpaca_secret_key = await safeDecrypt(data.alpaca_secret_key);

      // Interactive Brokers
      decryptedData.ib_account_id = await safeDecrypt(data.ib_account_id);
      decryptedData.ib_access_token = await safeDecrypt(data.ib_access_token);

      return new Response(
        JSON.stringify({ credentials: decryptedData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (operation === "debug") {
      // Return diagnostic info for OAuth debugging
      const { data, error } = await supabase
        .from("user_api_credentials")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error loading credentials for debug:", error);
        throw new Error("Failed to load credentials");
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const callbackUrl = `${supabaseUrl}/functions/v1/schwab-oauth-callback`;

      if (!data) {
        return new Response(
          JSON.stringify({
            debug: {
              clientIdPresent: false,
              clientIdDecryptOk: false,
              secretPresent: false,
              secretDecryptOk: false,
              refreshTokenPresent: false,
              refreshTokenDecryptOk: false,
              callbackUrl,
              brokerType: null,
              alpacaConfigured: false,
              etradeConfigured: false,
            }
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Test decryption for each field
      const testDecrypt = async (value: string | null): Promise<{ present: boolean; decryptOk: boolean; preview: string | null }> => {
        if (!value) return { present: false, decryptOk: false, preview: null };
        try {
          const decrypted = await decryptText(value);
          const preview = decrypted.length > 4 ? decrypted.substring(0, 4) + "..." : decrypted;
          return { present: true, decryptOk: true, preview };
        } catch (e) {
          const preview = value.length > 8 ? value.substring(0, 8) + "..." : value;
          return { present: true, decryptOk: false, preview: `(raw) ${preview}` };
        }
      };

      const clientIdResult = await testDecrypt(data.schwab_client_id);
      const secretResult = await testDecrypt(data.schwab_client_secret);
      const refreshTokenResult = await testDecrypt(data.schwab_refresh_token);
      const alpacaKeyResult = await testDecrypt(data.alpaca_api_key);
      const alpacaSecretResult = await testDecrypt(data.alpaca_secret_key);
      const etradeKeyResult = await testDecrypt(data.etrade_consumer_key);
      const etradeSecretResult = await testDecrypt(data.etrade_consumer_secret);

      return new Response(
        JSON.stringify({
          debug: {
            // Schwab
            clientIdPresent: clientIdResult.present,
            clientIdDecryptOk: clientIdResult.decryptOk,
            clientIdPreview: clientIdResult.preview,
            secretPresent: secretResult.present,
            secretDecryptOk: secretResult.decryptOk,
            secretPreview: secretResult.preview,
            refreshTokenPresent: refreshTokenResult.present,
            refreshTokenDecryptOk: refreshTokenResult.decryptOk,
            refreshTokenPreview: refreshTokenResult.preview,
            // Alpaca
            alpacaConfigured: alpacaKeyResult.present && alpacaSecretResult.present,
            alpacaKeyDecryptOk: alpacaKeyResult.decryptOk,
            alpacaSecretDecryptOk: alpacaSecretResult.decryptOk,
            alpacaPaperMode: data.alpaca_paper_mode,
            // E*TRADE
            etradeConfigured: etradeKeyResult.present && etradeSecretResult.present,
            etradeKeyDecryptOk: etradeKeyResult.decryptOk,
            etradeSecretDecryptOk: etradeSecretResult.decryptOk,
            // General
            brokerType: data.broker_type,
            tradingMode: data.trading_mode,
            updatedAt: data.updated_at,
            callbackUrl,
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      throw new Error("Invalid operation");
    }

  } catch (error) {
    console.error("Error in encrypt-credentials function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
