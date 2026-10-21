// bot-control: the only way to switch the trading bot between paper and live.
// Users can't set bot_mode / live_armed_at directly (column privileges), so
// the checks below can't be skipped by writing to the database.
//
// POST { action: "go_live", confirm: "GO LIVE" } | { action: "go_paper" }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAudit } from "../_shared/audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const ALLOWED_ROLES = new Set(["enterprise", "admin"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));

  if (body.action === "go_paper") {
    const { data, error } = await admin.from("auto_trading_settings").update({ bot_mode: "paper", live_armed_at: null }).eq("user_id", user.id).select().single();
    if (error) return json({ error: error.message }, 400);
    await logAudit({ userId: user.id, action: "bot.mode.paper", resourceType: "bot", details: {} });
    return json({ ok: true, settings: data });
  }

  if (body.action === "go_live") {
    if (body.confirm !== "GO LIVE") return json({ error: 'Type "GO LIVE" to confirm.' }, 400);
    const { data: role } = await admin.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    if (!ALLOWED_ROLES.has(role?.role)) return json({ error: "Live trading is part of the Enterprise plan." }, 403);
    const { data: conn } = await admin.from("mcp_connections").select("state, scope_mode, metadata").eq("user_id", user.id).eq("provider", "robinhood").maybeSingle();
    if (!conn || conn.state !== "ready") return json({ error: "Connect Robinhood first (Settings)." }, 400);
    if (conn.scope_mode !== "trading") return json({ error: "Robinhood is connected read-only. Reconnect with trading allowed." }, 400);
    const check = conn.metadata?.bot;
    if (!check?.ok || !check.checkedAt || Date.now() - Date.parse(check.checkedAt) > 7 * 86_400_000) {
      return json({ error: "Run the Robinhood check first (it must pass within the last 7 days)." }, 400);
    }
    const { data: s } = await admin.from("auto_trading_settings").select("*").eq("user_id", user.id).maybeSingle();
    if (!s) return json({ error: "Save the bot settings first." }, 400);
    const { data, error } = await admin.from("auto_trading_settings").update({ bot_mode: "live", live_armed_at: new Date().toISOString() }).eq("user_id", user.id).select().single();
    if (error) return json({ error: error.message }, 400);
    await logAudit({
      userId: user.id, action: "bot.mode.live", resourceType: "bot",
      details: { risk_per_trade_pct: s.risk_per_trade_pct, max_position_size: s.max_position_size, max_daily_loss: s.max_daily_loss, max_open_positions: s.max_open_positions, max_daily_trades: s.max_daily_trades },
      userAgent: req.headers.get("user-agent") || undefined,
    });
    return json({ ok: true, settings: data });
  }
  return json({ error: "Unknown action" }, 400);
});
