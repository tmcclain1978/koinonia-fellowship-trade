import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateOrder } from "../_shared/paper-account.ts";
import { fetchQuote } from "../_shared/quote.ts";
import { settleFill } from "../_shared/settle-fill.ts";
import { shouldFill, nextTrailingStop, type WorkingOrder } from "../_shared/paper-orders.ts";
import { isCronCall } from "../_shared/internal-auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const now = () => new Date().toISOString();

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const cron = isCronCall(req);
    let supabase: any;
    let scopeUserId: string | null = null;

    if (cron) {
      // batch across all users with the service role (bypasses RLS)
      supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    } else {
      supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      scopeUserId = user.id;
    }

    let q = supabase.from('paper_orders').select('*').eq('status', 'working');
    if (scopeUserId) q = q.eq('user_id', scopeUserId);
    const { data: orders } = await q;

    const quoteCache = new Map<string, any>();
    const accountCache = new Map<string, any>();
    const summary = { evaluated: 0, filled: 0, expired: 0, cancelled: 0, triggered: 0, rejected: 0 };
    const today = now().split('T')[0];

    const getQuote = async (userId: string, symbol: string) => {
      if (quoteCache.has(symbol)) return quoteCache.get(symbol);
      const qt = await fetchQuote(supabase, userId, symbol);
      quoteCache.set(symbol, qt);
      return qt;
    };
    const getAccount = async (accountId: string) => {
      if (accountCache.has(accountId)) return accountCache.get(accountId);
      const { data } = await supabase.from('paper_trading_accounts').select('*').eq('id', accountId).single();
      accountCache.set(accountId, data);
      return data;
    };

    for (const o of orders || []) {
      summary.evaluated++;

      // Time-in-force: DAY orders placed before today expire (market-hours nuance is future work)
      if (o.time_in_force === 'DAY' && (o.created_at || '').split('T')[0] < today) {
        await supabase.from('paper_orders').update({ status: 'expired', updated_at: now() }).eq('id', o.id);
        summary.expired++;
        continue;
      }

      const quote = await getQuote(o.user_id, o.symbol);
      if (!quote) continue; // no price -> leave working

      const wo: WorkingOrder = {
        orderType: o.order_type, side: o.side,
        limitPrice: o.limit_price, stopPrice: o.stop_price,
        trailAmount: o.trail_amount, trailPercent: o.trail_percent,
        watermark: o.watermark, stopTriggered: o.stop_triggered,
      };

      // Trailing stops ratchet even when they don't fill
      if (o.order_type === 'trailing_stop') {
        const t = nextTrailingStop(wo, quote);
        if (t && (t.stopPrice !== o.stop_price || t.watermark !== o.watermark)) {
          await supabase.from('paper_orders').update({ stop_price: t.stopPrice, watermark: t.watermark, updated_at: now() }).eq('id', o.id);
          wo.stopPrice = t.stopPrice; wo.watermark = t.watermark;
        }
      }

      const decision = shouldFill(wo, quote);

      // stop-limit converted to a limit but not yet filled
      if (!decision.fill && decision.stopTriggered && !o.stop_triggered) {
        await supabase.from('paper_orders').update({ stop_triggered: true, updated_at: now() }).eq('id', o.id);
        summary.triggered++;
      }
      if (!decision.fill || !decision.fillPrice) continue;

      const account = await getAccount(o.account_id);
      if (!account) continue;
      const { data: posRows } = await supabase.from('paper_positions').select('*').eq('account_id', o.account_id);
      const keyMatch = (p: any) => p.symbol === o.symbol && (p.contract_key ?? null) === (o.contract_key ?? null);
      const existingRow = (posRows || []).find(keyMatch) || null;
      const mult = Number(o.multiplier);
      const existing = existingRow ? { qty: Number(existingRow.quantity), avgCost: Number(existingRow.avg_cost), mult } : null;
      const others = (posRows || []).filter((p: any) => !keyMatch(p)).map((p: any) => ({ qty: Number(p.quantity), avgCost: Number(p.avg_cost), mult: Number(p.multiplier) }));

      // Re-check buying power at fill time
      const check = validateOrder(Number(account.balance), existing, o.side, Number(o.quantity), decision.fillPrice, mult, others);
      if (!check.ok) {
        await supabase.from('paper_orders').update({ status: 'rejected', notes: (o.notes ? o.notes + ' | ' : '') + check.reason, updated_at: now() }).eq('id', o.id);
        summary.rejected++;
        continue;
      }

      await settleFill({ supabase, userId: o.user_id, account, symbol: o.symbol, contractKey: o.contract_key, mult, side: o.side, qty: Number(o.quantity), fillPrice: decision.fillPrice, notes: o.notes, existingRow });
      await supabase.from('paper_orders').update({ status: 'filled', filled_price: decision.fillPrice, filled_at: now(), stop_triggered: decision.stopTriggered, updated_at: now() }).eq('id', o.id);
      summary.filled++;

      // OCO: a fill cancels the other working legs in its group
      if (o.oco_group) {
        const { data: cx } = await supabase.from('paper_orders')
          .update({ status: 'cancelled', updated_at: now() })
          .eq('oco_group', o.oco_group).eq('status', 'working').neq('id', o.id).select('id');
        summary.cancelled += (cx?.length || 0);
      }
      // Bracket: activate children that were waiting on this parent
      await supabase.from('paper_orders')
        .update({ status: 'working', updated_at: now() })
        .eq('parent_order_id', o.id).eq('status', 'pending_parent');
    }

    return new Response(JSON.stringify({ success: true, ...summary }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('evaluate-paper-orders error:', e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
