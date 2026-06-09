// Returns the user's Robinhood MCP connection status + tool catalog (if ready).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { McpHttpClient } from "../_shared/mcp-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return j({ error: "Unauthorized" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return j({ error: "Unauthorized" }, 401);

    const { data: conn } = await supabase.from("mcp_connections").select("*")
      .eq("user_id", user.id).eq("provider", "robinhood").maybeSingle();

    if (!conn) return j({ connected: false, state: "disconnected" });

    let tools: { name: string; description?: string }[] = [];
    if (conn.state === "ready") {
      try {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const client = await McpHttpClient.fromConnection(conn as any, admin);
        await client.initialize();
        tools = (await client.listTools()).map((t) => ({ name: t.name, description: t.description }));
      } catch (e) {
        return j({ connected: true, state: conn.state, scope_mode: conn.scope_mode,
          updated_at: conn.updated_at, tool_error: e instanceof Error ? e.message : String(e), tools: [] });
      }
    }

    return j({
      connected: true, state: conn.state, scope_mode: conn.scope_mode,
      updated_at: conn.updated_at, last_error: conn.last_error, tools,
    });
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
