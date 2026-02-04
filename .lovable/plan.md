
# Fix PocketOption Connection: Regional Endpoint Support

## Problem Identified

Based on the edge function logs and your input, I found the root cause:

**The edge function uses hardcoded endpoints that don't include your regional server:**
- Current endpoints tried: `demo-api-v2.po.market`, `api-v2.po.market`, `demo.pocketoption.com`, `pocketoption.com`
- Your actual endpoint: `wss://api-eu.po.market/socket.io/?EIO=4&transport=websocket` (EU regional)

PocketOption routes users to different regional servers (api-eu, api-in, api-us, etc.) based on location. Our static endpoint list misses these.

## Solution

### 1. Update Endpoint Discovery

Instead of hardcoding endpoints, extract the correct endpoint from the user's SSID or allow dynamic endpoint configuration.

### 2. Add Regional Endpoints

Add all known PocketOption regional endpoints to the fallback list:
- `api-eu.po.market` (Europe)
- `api-in.po.market` (India/Asia)
- `api-us.po.market` (Americas)
- `api-v2.po.market` (Generic)
- `platform44.po2.capital` (Alternative)

### 3. Fix Demo Mode Detection

Since you're connecting to a **real** account, ensure the `isDemo: 0` flag is correctly parsed and sent in the auth message.

## Implementation Details

### Changes to `supabase/functions/pocketoption-websocket/index.ts`

**Updated endpoint list:**
```javascript
const PO_ENDPOINTS = [
  // Regional endpoints (prioritize based on common usage)
  "wss://api-eu.po.market/socket.io/?EIO=4&transport=websocket",
  "wss://api-in.po.market/socket.io/?EIO=4&transport=websocket", 
  "wss://api-us.po.market/socket.io/?EIO=4&transport=websocket",
  "wss://api-v2.po.market/socket.io/?EIO=4&transport=websocket",
  // Demo endpoints
  "wss://demo-api-v2.po.market/socket.io/?EIO=4&transport=websocket",
  // Alternative hosts
  "wss://platform44.po2.capital/socket.io/?EIO=4&transport=websocket",
  "wss://platform32.po2.capital/socket.io/?EIO=4&transport=websocket",
  // Legacy endpoints
  "wss://pocketoption.com/socket.io/?EIO=4&transport=websocket",
];
```

**Improved SSID parsing** to correctly extract `isDemo` flag:
```javascript
const parseSSID = (ssidString) => {
  // Handle 42["auth", {...}] format
  // Handle 42["user_init", {...}] format
  // Correctly parse isDemo as 0 for real, 1 for demo
  // Extract session, uid from multiple formats
};
```

**Add connection retry with exponential backoff:**
```javascript
// Instead of immediate retry on failure, add delays:
// Attempt 1: immediate
// Attempt 2: 500ms delay
// Attempt 3: 1000ms delay
// etc.
```

**Add verbose logging** to diagnose which endpoint works:
```javascript
console.log(`Trying endpoint: ${endpoint}`);
console.log(`Auth data being sent:`, { session: '...redacted...', isDemo, uid });
```

### Changes to `src/hooks/usePocketOptionWebSocket.ts`

**Improve reconnection logic:**
- Add exponential backoff (start 2s, max 30s)
- Track connection attempts
- Show connection status in UI

**Handle new message types:**
- `po_authenticated` - successful auth with PocketOption
- Better error messages with specific failure reasons

### Changes to `src/components/PocketOptionConnection.tsx`

**Add endpoint field (optional):**
- Allow users to paste their WebSocket URL from DevTools
- Auto-detect endpoint from SSID if possible
- Store preferred endpoint for faster reconnection

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/pocketoption-websocket/index.ts` | Add EU/regional endpoints, improve SSID parsing, add exponential backoff |
| `src/hooks/usePocketOptionWebSocket.ts` | Better reconnection logic with backoff, handle more message types |
| `src/components/PocketOptionConnection.tsx` | Optional: Add endpoint input field for troubleshooting |

## Database Changes

None required.

## Summary

The connection fails because PocketOption routes users to regional servers (like `api-eu.po.market`) that aren't in our endpoint list. The fix adds:

1. All known regional endpoints to the fallback list
2. Proper handling of real vs demo account mode
3. Better retry logic with exponential backoff
4. Improved logging to diagnose future issues
