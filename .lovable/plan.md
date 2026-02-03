

# Fix PocketOption WebSocket Connection

## Problem Identified

The WebSocket connection fails immediately (`readyState: 3` = CLOSED) because of two critical issues:

1. **JWT Verification Timing**: The edge function has `verify_jwt = true`, but WebSocket clients cannot send Authorization headers. The token is passed via query parameter, but Supabase's built-in JWT verification rejects the request before the function even runs.

2. **Authentication Location**: The current code tries to authenticate AFTER `Deno.upgradeWebSocket()` inside `socket.onopen`. This is too late - authentication must happen BEFORE the upgrade.

## Solution

Fix the WebSocket edge function to follow Supabase's official WebSocket relay pattern:

### Changes Required

**File: `supabase/config.toml`**
- Change `verify_jwt = false` for `pocketoption-websocket` function (we'll verify manually)

**File: `supabase/functions/pocketoption-websocket/index.ts`**
- Move authentication BEFORE `Deno.upgradeWebSocket()`
- Use `supabase.auth.getUser(jwt)` to verify the token synchronously
- Return 403 if authentication fails BEFORE upgrading
- Use service role key for database queries

### Updated Edge Function Flow

```text
Current (Broken):
┌──────────────┐     ┌───────────────────────┐
│ Browser      │────▶│ Edge Function         │
│ WebSocket    │     │ 1. Upgrade WebSocket  │ ← Supabase rejects (verify_jwt=true)
│              │     │ 2. Auth in onopen     │
└──────────────┘     └───────────────────────┘
                            ❌ FAILS

Fixed:
┌──────────────┐     ┌───────────────────────┐
│ Browser      │────▶│ Edge Function         │
│ WebSocket    │     │ 1. Check JWT from URL │
│ ?token=xxx   │     │ 2. Verify with Supabase│
│              │     │ 3. Return 403 if bad  │
│              │     │ 4. Upgrade WebSocket  │ ← Only if auth succeeds
│              │     │ 5. Connect to PO      │
└──────────────┘     └───────────────────────┘
                            ✅ WORKS
```

### Implementation Details

**Edge Function Changes:**
```javascript
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const upgrade = req.headers.get('upgrade') || '';
  if (upgrade.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket', { status: 400 });
  }

  // CRITICAL: Authenticate BEFORE upgrading
  const url = new URL(req.url);
  const jwt = url.searchParams.get('token');
  
  if (!jwt) {
    return new Response('Auth token not provided', { status: 403 });
  }

  // Use service role to verify user and fetch credentials
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) {
    return new Response('Invalid token', { status: 403 });
  }

  // Fetch credentials BEFORE upgrade
  const { data: creds } = await supabase
    .from('user_api_credentials')
    .select('pocketoption_ssid')
    .eq('user_id', user.id)
    .single();

  if (!creds?.pocketoption_ssid) {
    return new Response('PocketOption credentials not found', { status: 400 });
  }

  // NOW safe to upgrade
  const { socket, response } = Deno.upgradeWebSocket(req);
  
  // Pass credentials to socket handlers via closure
  setupWebSocketHandlers(socket, creds.pocketoption_ssid);

  return response;
});
```

### Config Change

In `supabase/config.toml`:
```toml
[functions.pocketoption-websocket]
verify_jwt = false  # Changed from true - we verify manually
```

### Client-Side Update

The client code in `usePocketOptionWebSocket.ts` is already correct - it passes the token via query parameter:
```javascript
const wsUrl = `wss://${projectRef}.supabase.co/functions/v1/pocketoption-websocket?token=${session.access_token}`;
```

---

## Summary

| Change | File | Description |
|--------|------|-------------|
| Disable built-in JWT | `supabase/config.toml` | Set `verify_jwt = false` |
| Move auth before upgrade | `pocketoption-websocket/index.ts` | Authenticate synchronously before `Deno.upgradeWebSocket()` |
| Use service role key | `pocketoption-websocket/index.ts` | Use `SUPABASE_SERVICE_ROLE_KEY` for database access |
| Pre-fetch credentials | `pocketoption-websocket/index.ts` | Get SSID before upgrading WebSocket |

This follows the official Supabase pattern for authenticated WebSocket connections.
