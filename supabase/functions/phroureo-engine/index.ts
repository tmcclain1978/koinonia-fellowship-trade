// phroureo-engine: runs Phroureo exit strategies every minute (pg_cron) during
// regular trading hours, with real prices fetched on the server.
//
// For each active strategy on a paper position:
//   1. find the position (gone -> strategy completed, its stop order cancelled)
//   2. price it (the option contract's own quote for options)
//   3. apply the trigger / stop / trailing rules (_shared/phroureo.ts)
//   4. keep a real working STOP order in paper_orders at current_stop_price;
//      evaluate-paper-orders fills it when price reaches it.
//
// Before this, nothing called this function, it trusted prices sent by the
// caller (and had no auth), never placed or checked a stop, and counted every
// position as option contracts (×100).
//
// Calls: pg_cron (x-cron-secret), another function (x-internal-secret), or a
// signed-in user (only their own strategies).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isCronCall, isInternalCall } from "../_shared/internal-auth.ts";
import { isRegularSessionTime } from "../_shared/candle-buckets.ts";
import { fetchQuote } from "../_shared/quote.ts";
import { stepStrategy, type PhroureoStrategy } from "../_shared/phroureo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-secret",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const ACTIVE = ["ARMED", "TRIGGERED_STOP_SET", "TRAILING_ACTIVE"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cron = isCronCall(req);
  let onlyUser: string | null = null;
  if (!cron && !isInternalCall(req)) {
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data } = await admin.auth.getUser(jwt);
    if (!data?.user) return json({ error: "Unauthorized" }, 401);
    onlyUser = data.user.id;
  }
  const now = Date.now();
  if (!isRegularSessionTime(now)) return json({ skipped: "outside regular trading hours" });

  let q = admin.from("phroureo_exit_strategies").select("*").eq("enabled", true).in("state", ACTIVE);
  if (onlyUser) q = q.eq("user_id", onlyUser);
  const { data: strategies, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const summary = { checked: 0, triggered: 0, trailed: 0, completed: 0, stopsPlaced: 0, stopsMoved: 0, noPrice: 0, errors: 0 };
  const accounts = new Map<string, any>();
  const positionsByAccount = new Map<string, any[]>();
  const nowIso = new Date(now).toISOString();
  const event = (strategy_id: string, e: Record<string, unknown>) => admin.from("phroureo_strategy_events").insert({ strategy_id, ...e });

  for (const s of strategies ?? []) {
    summary.checked++;
    try {
      if (s.position_type !== "paper") continue; // live positions: not supported yet (the UI only creates paper ones)

      if (!accounts.has(s.user_id)) {
        const { data: acct } = await admin.from("paper_trading_accounts").select("*").eq("user_id", s.user_id).maybeSingle();
        accounts.set(s.user_id, acct);
        if (acct) {
          const { data: rows } = await admin.from("paper_positions").select("*").eq("account_id", acct.id);
          positionsByAccount.set(acct.id, rows ?? []);
        }
      }
      const account = accounts.get(s.user_id);
      const positions = account ? positionsByAccount.get(account.id) ?? [] : [];
      const pos = positions.find((p: any) => p.symbol === s.symbol && (p.contract_key ?? null) === (s.contract_key ?? null));

      // The stop order we keep at the broker (paper).
      let order: any = null;
      if (s.paper_order_id) {
        const { data } = await admin.from("paper_orders").select("*").eq("id", s.paper_order_id).maybeSingle();
        order = data;
      }
      const finish = async (reason: string) => {
        if (order?.status === "working") await admin.from("paper_orders").update({ status: "cancelled", updated_at: nowIso }).eq("id", order.id);
        await admin.from("phroureo_exit_strategies").update({ state: "COMPLETED", enabled: false, last_update_at: nowIso }).eq("id", s.id);
        await event(s.id, { event_type: "STATE_CHANGE", previous_state: s.state, new_state: "COMPLETED", reason });
        summary.completed++;
      };

      if (order?.status === "filled") {
        await finish(`Stop filled at $${Number(order.filled_price).toFixed(2)}. Position closed.`);
        continue;
      }
      if (!pos || Number(pos.quantity) === 0) {
        await finish("Position is closed; protection finished.");
        continue;
      }
      if (order && order.status === "cancelled" && s.current_stop_price != null) {
        // Cancelled by hand: respect that and pause, rather than re-placing it.
        await admin.from("phroureo_exit_strategies").update({ enabled: false, paper_order_id: null, last_update_at: nowIso }).eq("id", s.id);
        await event(s.id, { event_type: "PAUSED", reason: "The protective stop order was cancelled, so this strategy was paused." });
        continue;
      }

      const posQty = Number(pos.quantity);
      const strategy: PhroureoStrategy = {
        ...s,
        side: posQty > 0 ? "long" : "short",
        quantity: Math.min(Math.abs(posQty), Math.abs(Number(s.quantity)) || Math.abs(posQty)),
        multiplier: Number(pos.multiplier) || 1,
        entry_price: Number(s.entry_price),
        profit_trigger_value: Number(s.profit_trigger_value),
        stop_set_value: s.stop_set_value == null ? null : Number(s.stop_set_value),
        trailing_amount: s.trailing_amount == null ? null : Number(s.trailing_amount),
        trail_step_value: s.trail_step_value == null ? null : Number(s.trail_step_value),
        current_stop_price: s.current_stop_price == null ? null : Number(s.current_stop_price),
        reference_price: s.reference_price == null ? null : Number(s.reference_price),
      };

      const quote = await fetchQuote(admin, s.user_id, s.symbol, s.contract_key ?? null);
      const price = quote ? (quote.mark ?? quote.last ?? (quote.bid && quote.ask ? (quote.bid + quote.ask) / 2 : null)) : null;
      if (!price) { summary.noPrice++; continue; }

      const step = stepStrategy(strategy, price, now);
      if (Object.keys(step.patch).length) await admin.from("phroureo_exit_strategies").update(step.patch).eq("id", s.id);
      if (step.event) {
        await event(s.id, step.event);
        if (step.event.event_type === "TRIGGER_HIT") summary.triggered++;
        else summary.trailed++;
      }

      // Keep the stop order in step.
      const stop = (step.patch.current_stop_price as number | undefined) ?? strategy.current_stop_price;
      if (stop == null) continue;
      const exitSide = strategy.side === "long" ? "sell" : "buy";
      if (order && order.status === "working") {
        if (Math.abs(Number(order.stop_price) - stop) > 1e-6 || Number(order.quantity) !== strategy.quantity) {
          await admin.from("paper_orders").update({ stop_price: stop, quantity: strategy.quantity, updated_at: nowIso }).eq("id", order.id);
          summary.stopsMoved++;
        }
      } else {
        const { data: created, error: insErr } = await admin.from("paper_orders").insert({
          user_id: s.user_id, account_id: account.id, symbol: s.symbol, contract_key: s.contract_key ?? null, multiplier: Number(pos.multiplier) || 1,
          side: exitSide, order_type: "stop", quantity: strategy.quantity, stop_price: stop, time_in_force: "GTC", status: "working",
          notes: `Phroureo stop (${s.strategy_name ?? "exit strategy"})`,
        }).select().single();
        if (insErr) throw insErr;
        await admin.from("phroureo_exit_strategies").update({ paper_order_id: created.id }).eq("id", s.id);
        await event(s.id, { event_type: "STOP_UPDATE", previous_stop: null, new_stop: stop, trigger_price: price, reason: `Protective stop order placed at $${stop.toFixed(2)}.` });
        summary.stopsPlaced++;
      }
    } catch (e) {
      summary.errors++;
      await event(s.id, { event_type: "ERROR", reason: (e as Error).message });
    }
  }
  return json(summary);
});
