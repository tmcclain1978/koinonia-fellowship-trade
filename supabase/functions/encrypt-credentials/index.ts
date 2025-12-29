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
    // This ensures the same key is used across function invocations
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const encoder = new TextEncoder();
    const data = encoder.encode(serviceKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    keyData = new Uint8Array(hashBuffer);
  } else {
    try {
      keyData = Uint8Array.from(atob(ENCRYPTION_KEY_B64), c => c.charCodeAt(0));
      // Validate key length
      if (keyData.length !== 32) {
        throw new Error("Invalid key length");
      }
    } catch (error) {
      // If base64 decode fails or wrong length, fall back to hash-based key
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
  
  // Combine IV and ciphertext, then base64 encode
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

async function decryptText(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  
  // Extract IV and ciphertext
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
      // Encrypt and save credentials
      const encryptedData: any = {
        user_id: user.id,
        trading_mode: credentials.trading_mode || "paper",
      };

      if (credentials.schwab_client_id) {
        encryptedData.schwab_client_id = await encryptText(credentials.schwab_client_id);
      }
      if (credentials.schwab_client_secret) {
        encryptedData.schwab_client_secret = await encryptText(credentials.schwab_client_secret);
      }
      if (credentials.schwab_refresh_token) {
        encryptedData.schwab_refresh_token = await encryptText(credentials.schwab_refresh_token);
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

      const decryptedData: any = {
        trading_mode: data.trading_mode,
        broker_type: data.broker_type,
      };

      const safeDecrypt = async (value: string | null) => {
        if (!value) return null;
        try {
          return await decryptText(value);
        } catch (e) {
          // Value might already be plain text (e.g., older data or other functions wrote it)
          console.warn("[encrypt-credentials] Could not decrypt value, returning as-is");
          return value;
        }
      };

      decryptedData.schwab_client_id = await safeDecrypt(data.schwab_client_id);
      decryptedData.schwab_client_secret = await safeDecrypt(data.schwab_client_secret);
      decryptedData.schwab_refresh_token = await safeDecrypt(data.schwab_refresh_token);

      return new Response(
        JSON.stringify({ credentials: decryptedData }),
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
