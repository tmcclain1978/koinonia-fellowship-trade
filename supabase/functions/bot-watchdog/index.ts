// bot-watchdog: every 5 minutes on weekdays (pg_cron). Tells the user when
// something needs them, instead of failing quietly:
//   - the bot is on (or has open trades) but hasn't run for 4+ minutes during
//     the session (schedule or secret broken, function failing)
//   - a bot trade is in "error" (the bot stopped touching it on purpose)
//   - the Schwab login is about to expire (Schwab logins last 7 days) or
//     already has (no real-time prices -> no new live trades)
// Notifications go to the bell (and email for live-money problems), each at
// most once per window.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isCronCall, isInternalCall } from "../_shared/internal-auth.ts";
import { botPhase, sessionBounds } from "../_shared/bot/session.ts";
import { getSchwabAccessToken } from "../_shared/schwab-token.ts";
import { notifyUser } from "../_shared/notify.ts";
import { watchdogFindings, type WatchdogInput } from "../_shared/bot/watchdog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-secret",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!isCronCall(req) && !isInternalCall(req)) return json({ error: "Unauthorized" }, 401);
  const now = Date.now();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: settings } = await admin.from("auto_trading_settings").select("user_id, enabled, bot_mode, last_run_at, last_status, notify_email");
  const { data: trades } = await admin.from("bot_trades").select("user_id, mode, symbol, status, note").in("status", ["entering", "open", "exiting", "error"]);
  const { data: creds } = await admin.from("user_api_credentials").select("user_id, schwab_refresh_token, schwab_refresh_issued_at");

  const users = new Set<string>([...(settings ?? []).map((s: any) => s.user_id), ...(trades ?? []).map((t: any) => t.user_id), ...(creds ?? []).filter((c: any) => c.schwab_refresh_token).map((c: any) => c.user_id)]);
  const phase = botPhase(now);
  let sent = 0;
  for (const userId of users) {
    const s = (settings ?? []).find((x: any) => x.user_id === userId) ?? null;
    const c = (creds ?? []).find((x: any) => x.user_id === userId) ?? null;
    const userTrades = (trades ?? []).filter((t: any) => t.user_id === userId);
    const input: WatchdogInput = {
      now,
      phase,
      sessionOpenAt: sessionBounds(now).open,
      botEnabled: !!s?.enabled,
      mode: s?.bot_mode === "live" ? "live" : "paper",
      lastRunAt: s?.last_run_at ?? null,
      activeTrades: userTrades.filter((t: any) => t.status !== "error").length,
      errorTrades: userTrades.filter((t: any) => t.status === "error").map((t: any) => ({ symbol: t.symbol, mode: t.mode, note: t.note })),
      schwab: c?.schwab_refresh_token
        ? { issuedAt: c.schwab_refresh_issued_at ?? null, working: (await getSchwabAccessToken(admin, userId).catch(() => null)) !== null }
        : null,
    };
    for (const f of watchdogFindings(input)) {
      if (await notifyUser(admin, userId, { ...f, email: f.email && s?.notify_email !== false })) sent++;
    }
  }
  return json({ users: users.size, sent, phase });
});
