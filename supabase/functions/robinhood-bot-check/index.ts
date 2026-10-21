// robinhood-bot-check: proves the bot can talk to the user's Robinhood
// Agentic account WITHOUT placing anything.
//
//   - lists the MCP tools and checks the ones the bot needs are there
//   - shows how the bot fills each tool's arguments (from the tool's schema)
//   - reads quotes, positions and the account for buying power
//   - runs review_equity_order (Robinhood's simulation) for 1 share of SPY
//   - reports the trade-approval setting (approvals ON means every bot order
//     waits for you in the app, so the bot can't trade unattended)
//
// The result is saved on the connection; live mode refuses to run without a
// passing check from the last 7 days.
//
// POST { action?: "check" | "set_account", account?: string }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { McpHttpClient } from "../_shared/mcp-client.ts";
import { buildArgs, dig, parseToolResult, robinhoodBroker, type ToolDescriptor } from "../_shared/bot/robinhood-broker.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export const REQUIRED_TOOLS = ["get_equity_quotes", "get_equity_positions", "get_equity_orders", "review_equity_order", "place_equity_order", "cancel_equity_order"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth } = await admin.auth.getUser(jwt);
    const user = auth?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));

    const { data: conn } = await admin.from("mcp_connections").select("*").eq("user_id", user.id).eq("provider", "robinhood").maybeSingle();
    if (!conn || conn.state !== "ready") return json({ ok: false, problems: ["Robinhood isn't connected. Connect it in Settings first."] });

    if (body.action === "set_account") {
      const account = typeof body.account === "string" && /^[A-Za-z0-9-]{3,40}$/.test(body.account) ? body.account : null;
      const meta = { ...(conn.metadata ?? {}), bot: { ...(conn.metadata?.bot ?? {}), account, ok: false, checkedAt: null } };
      await admin.from("mcp_connections").update({ metadata: meta }).eq("id", conn.id);
      return json({ ok: true, account, note: "Account saved. Run the check again." });
    }

    const problems: string[] = [];
    const warnings: string[] = [];
    const steps: Array<{ step: string; ok: boolean; detail?: unknown }> = [];
    if (conn.scope_mode !== "trading") problems.push("Robinhood is connected read-only. Disconnect and reconnect with trading allowed.");

    const mcp = await McpHttpClient.fromConnection(conn, admin);
    await mcp.initialize();
    const tools = (await mcp.listTools()) as ToolDescriptor[];
    const names = tools.map((t) => t.name);
    const missing = REQUIRED_TOOLS.filter((n) => !names.includes(n));
    steps.push({ step: "tools", ok: missing.length === 0, detail: { count: names.length, missing } });
    if (missing.length) problems.push(`Missing Robinhood tools: ${missing.join(", ")}.`);

    const byName = new Map(tools.map((t) => [t.name, t]));
    const account = conn.metadata?.bot?.account ?? null;
    const sample = { symbol: "SPY", side: "buy" as const, quantity: 1, kind: "market" as const, account, refId: crypto.randomUUID() };

    // How the bot fills each tool's arguments.
    const mapping: Record<string, unknown> = {};
    for (const n of REQUIRED_TOOLS) {
      const t = byName.get(n);
      if (!t) continue;
      try {
        const o = n === "cancel_equity_order" || n === "get_equity_orders" ? { orderId: "test", account } : n.includes("positions") ? { account } : n.includes("quotes") ? { symbol: "SPY" } : sample;
        mapping[n] = { ok: true, args: buildArgs(t, o), schema: t.inputSchema };
      } catch (e) {
        mapping[n] = { ok: false, error: (e as Error).message, schema: t.inputSchema };
        problems.push((e as Error).message);
      }
    }
    try {
      const stop = byName.get("place_equity_order");
      if (stop) buildArgs(stop, { ...sample, side: "sell", kind: "stop", stopPrice: 1 });
      steps.push({ step: "stop order fields", ok: true });
    } catch (e) {
      steps.push({ step: "stop order fields", ok: false, detail: (e as Error).message });
      problems.push(`Can't build a stop order: ${(e as Error).message}`);
    }

    const broker = robinhoodBroker(mcp, tools, { account });
    const quote = await broker.quote("SPY");
    steps.push({ step: "quote", ok: !!quote, detail: quote });
    if (!quote) problems.push("Couldn't read a SPY quote from Robinhood.");

    try {
      const acct = await broker.account();
      steps.push({ step: "account", ok: true, detail: acct });
    } catch (e) {
      steps.push({ step: "account", ok: false, detail: (e as Error).message });
      problems.push(`Couldn't read buying power: ${(e as Error).message}`);
    }

    const held = await broker.positionQty("SPY");
    steps.push({ step: "positions", ok: held !== null, detail: { SPY: held } });
    if (held === null) problems.push("Couldn't read positions from Robinhood.");

    // Accounts (so the user can pick the Agentic account if tools need one).
    const accountTool = tools.find((t) => /account/i.test(t.name) && !(t.inputSchema?.required ?? []).length);
    let accounts: unknown = null;
    if (accountTool) {
      try {
        accounts = parseToolResult(await mcp.callTool(accountTool.name, {})).data;
      } catch { /* optional */ }
    }

    // Trade approvals.
    let approvals: unknown = null;
    if (names.includes("get_trade_approval_setting")) {
      try {
        const r = parseToolResult(await mcp.callTool("get_trade_approval_setting", {}));
        approvals = r.data ?? r.text;
        const on = dig(r.data, ["enabled", "trade_approvals_enabled", "approvals_enabled", "is_enabled"]);
        if (on === true) problems.push("Trade approvals are ON for the Agentic account, so every bot order would wait for you in the Robinhood app. Turn them off in the account's Agent Settings to trade unattended.");
      } catch { /* optional */ }
    }

    // Robinhood's own simulation of a 1-share SPY market buy. Nothing is placed.
    if (byName.get("review_equity_order")) {
      try {
        const r = parseToolResult(await mcp.callTool("review_equity_order", buildArgs(byName.get("review_equity_order")!, sample)));
        const err = !r.ok || dig(r.data, ["error", "errors", "rejection_reason"]);
        steps.push({ step: "review 1 share SPY (not placed)", ok: !err, detail: r.data ?? r.text });
        if (err) problems.push(`Robinhood's order review flagged a problem: ${typeof err === "string" ? err : r.text.slice(0, 200)}`);
      } catch (e) {
        steps.push({ step: "review 1 share SPY (not placed)", ok: false, detail: (e as Error).message });
        problems.push(`Order review failed: ${(e as Error).message}`);
      }
    }
    if (!account) warnings.push("No account number saved. That's fine if Robinhood places agent orders in the Agentic account by default (it should); pick one below if the tools ask for it.");

    const ok = problems.length === 0;
    const meta = { ...(conn.metadata ?? {}), bot: { ...(conn.metadata?.bot ?? {}), ok, checkedAt: new Date().toISOString(), problems, account } };
    await admin.from("mcp_connections").update({ metadata: meta }).eq("id", conn.id);
    return json({ ok, problems, warnings, steps, mapping, accounts, approvals, tools: names });
  } catch (e) {
    return json({ ok: false, problems: [(e as Error).message] }, 200);
  }
});
