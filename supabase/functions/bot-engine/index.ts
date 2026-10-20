// bot-engine: runs every minute during the trading day (pg_cron) and on
// "Run now" (run-my-bot, with the internal secret and a targetUserId).
//
// For each user with the bot on, or with open bot trades:
//   finish in-flight orders -> manage open trades -> scan for new ones.
// Paper mode trades a simulated ledger (paper_capital + bot P&L) with real
// prices; live mode trades the Robinhood Agentic account through its MCP.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isCronCall, isInternalCall } from "../_shared/internal-auth.ts";
import { getSchwabAccessToken } from "../_shared/schwab-token.ts";
import { McpHttpClient } from "../_shared/mcp-client.ts";
import { runBotForUser, type BotSettings, type RunSummary } from "../_shared/bot/engine.ts";
import { supabaseStore, toBotSettings, tryLock } from "../_shared/bot/store-supabase.ts";
import { paperBroker, type Broker } from "../_shared/bot/broker.ts";
import { robinhoodBroker } from "../_shared/bot/robinhood-broker.ts";
import { polygonData, schwabData, type MarketData } from "../_shared/bot/market-data.ts";
import { lovableReviewer } from "../_shared/bot/ai-review.ts";
import { botPhase } from "../_shared/bot/session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-secret",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const ALLOWED_ROLES = new Set(["enterprise", "admin"]);

async function marketDataFor(admin: any, userId: string): Promise<MarketData | null> {
  const token = await getSchwabAccessToken(admin, userId).catch(() => null);
  if (token) return schwabData(token);
  const key = Deno.env.get("POLYGON_API_KEY");
  return key ? polygonData(key) : null;
}

async function liveBroker(admin: any, userId: string): Promise<{ broker: Broker; checkOk: boolean }> {
  const { data: conn } = await admin.from("mcp_connections").select("*").eq("user_id", userId).eq("provider", "robinhood").maybeSingle();
  if (!conn || conn.state !== "ready") throw new Error("Robinhood isn't connected (Settings → Robinhood).");
  if (conn.scope_mode !== "trading") throw new Error("Robinhood is connected read-only. Reconnect with trading allowed.");
  // New live trades need a passing connection check from the last 7 days;
  // trades already open are always managed.
  const check = conn.metadata?.bot;
  const checkOk = !!check?.ok && !!check.checkedAt && Date.now() - Date.parse(check.checkedAt) <= 7 * 86_400_000;
  const mcp = await McpHttpClient.fromConnection(conn, admin);
  await mcp.initialize();
  const tools = await mcp.listTools();
  const account = conn.metadata?.bot?.account ?? null;
  const broker = robinhoodBroker(mcp, tools as any, {
    account,
    audit: (tool, args) => {
      if (/place|cancel/.test(tool)) console.log(`[bot-engine] robinhood ${tool}`, JSON.stringify(args));
    },
  });
  return { broker, checkOk };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const cron = isCronCall(req);
  if (!cron && !isInternalCall(req)) return json({ error: "Unauthorized" }, 401);
  const now = Date.now();
  const body = await req.json().catch(() => ({}));
  const targetUserId: string | null = !cron && typeof body?.targetUserId === "string" ? body.targetUserId : null;
  const force = !cron && body?.force === true;

  if (cron && botPhase(now) === "closed") return json({ skipped: "market closed" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const store = supabaseStore(admin);

  // Users with the bot on, a close-all pending, or open trades to look after.
  let q = admin.from("auto_trading_settings").select("*");
  if (targetUserId) q = q.eq("user_id", targetUserId);
  const { data: rows, error } = await q;
  if (error) return json({ error: error.message }, 500);
  const { data: activeRows } = await admin.from("bot_trades").select("user_id, mode").in("status", ["entering", "open", "exiting"]);
  const activeModes = new Map<string, Set<string>>();
  for (const r of activeRows ?? []) {
    if (!activeModes.has(r.user_id)) activeModes.set(r.user_id, new Set());
    activeModes.get(r.user_id)!.add(r.mode);
  }
  const candidates = (rows ?? []).filter((r: any) => r.enabled || r.flatten_requested_at || activeModes.has(r.user_id));

  const results: Array<{ userId: string; mode: string; summary?: RunSummary; error?: string }> = [];
  for (const row of candidates) {
    const userId = row.user_id as string;
    if (!(await tryLock(admin, userId, now))) {
      results.push({ userId, mode: row.bot_mode, error: "another run is in progress" });
      continue;
    }
    let lastStatus = "";
    try {
      const { data: role } = await admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
      const base = toBotSettings(row);
      // Without the plan, the bot only looks after trades it already has.
      if (!ALLOWED_ROLES.has(role?.role)) base.enabled = false;

      const data = await marketDataFor(admin, userId);
      if (!data) throw new Error("No market data: connect Schwab or set POLYGON_API_KEY.");
      const ai = base.aiConfirm && Deno.env.get("LOVABLE_API_KEY") ? lovableReviewer(Deno.env.get("LOVABLE_API_KEY")!) : null;

      // The current mode, plus a manage-only pass for trades left in the other mode.
      const modes: Array<"paper" | "live"> = [base.mode];
      for (const m of activeModes.get(userId) ?? []) if (m !== base.mode) modes.push(m as "paper" | "live");

      for (const mode of modes) {
        const settings: BotSettings = mode === base.mode ? base : { ...base, mode, enabled: false };
        try {
          let broker: Broker;
          if (mode === "live") {
            const lb = await liveBroker(admin, userId);
            broker = lb.broker;
            if (!lb.checkOk && settings.enabled) {
              if (row.last_status !== "robinhood check needed") await store.event(userId, mode, "halt", "No new live trades: run the Robinhood check on the bot page (it must pass within the last 7 days).");
              settings.enabled = false;
              lastStatus = "robinhood check needed";
            }
          } else broker = paperBroker(settings.slippageBps);
          if (settings.aiConfirm && !ai && settings.enabled) {
            await store.event(userId, mode, "halt", "AI confirmation is on but the AI isn't configured (LOVABLE_API_KEY); no new trades.");
            settings.enabled = false;
          }
          const summary = await runBotForUser({ settings, store, broker, data, ai, now, force });
          if (mode === base.mode && lastStatus !== "robinhood check needed") lastStatus = summary.status;
          results.push({ userId, mode, summary });
        } catch (e) {
          const msg = (e as Error).message;
          if (row.last_status !== msg) await store.event(userId, mode, "error", msg);
          if (mode === base.mode) lastStatus = msg;
          results.push({ userId, mode, error: msg });
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (row.last_status !== msg) await store.event(userId, row.bot_mode ?? "paper", "error", msg);
      lastStatus = msg;
      results.push({ userId, mode: row.bot_mode, error: msg });
    } finally {
      await admin.from("auto_trading_settings").update({
        engine_lock_until: null, last_run_at: new Date(now).toISOString(), last_status: lastStatus.slice(0, 300),
      }).eq("user_id", userId);
    }
  }
  return json({ ran: results.length, results });
});
