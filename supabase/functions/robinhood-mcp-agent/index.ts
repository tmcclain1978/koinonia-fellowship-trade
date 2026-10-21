// AI agent that uses the caller's Robinhood MCP tools.
// Auth modes:
//   - User JWT (Authorization: Bearer <user JWT>)
//   - Internal (x-internal-secret + userId in body) — for bot edge functions to call
//
// Behavior:
//   - Loads the user's ready Robinhood MCP connection.
//   - Lists MCP tools, exposes them to Lovable AI Gateway via AI SDK dynamicTool.
//   - ALWAYS read-only: tools that could change the account (place/cancel/
//     buy/sell/submit/order/trade/transfer/...) are never exposed, whatever
//     the connection's scope. Trading goes through the bot (bot-engine), which
//     has sizing, loss limits and a stop on every position; an open-ended
//     chat agent with order tools had none of that.
//   - Runs streamText loop up to stepCountIs(50). Returns text + tool actions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateText, dynamicTool, stepCountIs } from "npm:ai@^4";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@^0.2";
import { jsonSchema } from "npm:ai@^4";
import { McpHttpClient } from "../_shared/mcp-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

// Anything that could change the account. "get_*" read tools like
// get_equity_orders are still allowed.
const MUTATING = /place|cancel|buy|sell|submit|transfer|withdraw|deposit|move|liquidate|exercise|approval|review|update|create|delete|modify|replace|add|remove|set|enable|disable/i;
const isReadTool = (name: string) => /^(get|list|search|lookup|fetch|read)_/i.test(name) && !/place|cancel|submit|transfer|exercise/i.test(name);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { prompt, system } = body;
    if (!prompt) return j({ error: "Missing prompt" }, 400);

    let userId: string | null = null;
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    const headerSecret = req.headers.get("x-internal-secret");
    if (internalSecret && headerSecret && headerSecret === internalSecret && body.userId) {
      userId = body.userId;
    } else {
      const auth = req.headers.get("Authorization");
      if (!auth) return j({ error: "Unauthorized" }, 401);
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return j({ error: "Unauthorized" }, 401);
      userId = user.id;
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: conn } = await admin.from("mcp_connections").select("*")
      .eq("user_id", userId).eq("provider", "robinhood").maybeSingle();
    if (!conn || conn.state !== "ready") return j({ error: "Robinhood MCP not connected." }, 412);

    const mcp = await McpHttpClient.fromConnection(conn as any, admin);
    await mcp.initialize();
    const allTools = await mcp.listTools();
    const readOnly = true;
    const exposed = allTools.filter((t) => isReadTool(t.name) || !MUTATING.test(t.name));

    const tools: Record<string, ReturnType<typeof dynamicTool>> = {};
    const actions: Array<{ tool: string; input: unknown; output: unknown; error?: string }> = [];
    for (const t of exposed) {
      tools[t.name] = dynamicTool({
        description: t.description ?? `Robinhood MCP tool: ${t.name}`,
        inputSchema: jsonSchema(t.inputSchema ?? { type: "object", properties: {} }),
        execute: async (input) => {
          try {
            const out = await mcp.callTool(t.name, (input ?? {}) as Record<string, unknown>);
            actions.push({ tool: t.name, input, output: out });
            return out;
          } catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            actions.push({ tool: t.name, input, output: null, error: err });
            return { error: err };
          }
        },
      });
    }

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return j({ error: "Missing LOVABLE_API_KEY" }, 500);
    const gateway = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const defaultSystem = readOnly
      ? "You are a trading research assistant. You may ONLY use read-only Robinhood tools to gather information. Do not attempt to place, cancel, or modify orders. Summarize findings clearly."
      : "You are a trading assistant with access to Robinhood tools. Before placing, modifying, or cancelling any order you MUST clearly state the action and parameters in your reply. Never trade without an explicit user instruction in the prompt.";

    const result = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: system ?? defaultSystem,
      prompt,
      tools,
      stopWhen: stepCountIs(50),
    });

    return j({ success: true, text: result.text, actions, scope_mode: conn.scope_mode, toolCount: exposed.length });
  } catch (e) {
    console.error("[robinhood-mcp-agent]", e);
    return j({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
