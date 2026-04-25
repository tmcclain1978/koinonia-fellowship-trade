// Shared encryption utilities for all edge functions
// Uses AES-256-GCM with CREDENTIALS_ENCRYPTION_KEY or derived key

const ENCRYPTION_KEY_B64 = Deno.env.get("CREDENTIALS_ENCRYPTION_KEY");

export async function getEncryptionKey(): Promise<CryptoKey> {
  let keyData: Uint8Array;

  if (!ENCRYPTION_KEY_B64) {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(serviceKey));
    keyData = new Uint8Array(hashBuffer);
  } else {
    try {
      keyData = Uint8Array.from(atob(ENCRYPTION_KEY_B64), c => c.charCodeAt(0));
      if (keyData.length !== 32) throw new Error("Invalid key length");
    } catch {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(ENCRYPTION_KEY_B64));
      keyData = new Uint8Array(hashBuffer);
    }
  }

  return crypto.subtle.importKey(
    "raw",
    keyData.buffer.slice(keyData.byteOffset, keyData.byteOffset + keyData.byteLength) as ArrayBuffer,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptText(plaintext: string): Promise<string> {
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

export async function decryptText(encrypted: string): Promise<string> {
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

/** Try to decrypt; if it fails, return the value as-is (plain text fallback) */
export async function safeDecrypt(value: string | null): Promise<string | null> {
  if (!value) return null;
  try {
    return await decryptText(value);
  } catch {
    console.warn("[encryption] Could not decrypt value, treating as plain text");
    return value;
  }
}
