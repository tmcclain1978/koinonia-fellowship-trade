// run-my-bot — the per-user, on-demand bot trigger called from the UI.
//
// Security model:
//   - verify_jwt = true at the gateway (set in config.toml)
//   - the user is taken from the verified JWT, never from the body, so a user
//     can only ever run their OWN bot
//   - only top-tier (enterprise) or admin users are allowed
//   - it then calls bot-engine with the internal secret and the user's id
//     (force: scan the latest bar now), so the logic lives in one place
//
// The scheduled run is pg_cron -> bot-engine every minute.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAuthedUser, internalHeaders } from "../_shared/internal-auth.ts";

const ALLOWED_ROLES = new Set(["enterprise", "admin"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Identify the caller from their token (not the request body).
    const user = await getAuthedUser(req, supabase) as { id: string } | null;
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401, req);

    // Top-tier gate, enforced server-side.
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!roleRow || !ALLOWED_ROLES.has(roleRow.role)) {
      return jsonResponse(
        { error: "Auto-trading is available on the top (Enterprise) tier only." },
        403,
        req,
      );
    }

    // Delegate to the fleet runner, scoped to just this user, authenticated
    // with the internal secret.
    const { data, error } = await supabase.functions.invoke("bot-engine", {
      headers: internalHeaders(),
      body: { targetUserId: user.id, force: true },
    });

    if (error) {
      return jsonResponse({ error: error.message }, 502, req);
    }
    return jsonResponse({ ok: true, result: data }, 200, req);
  } catch (err) {
    console.error("[run-my-bot] error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
      req,
    );
  }
});
