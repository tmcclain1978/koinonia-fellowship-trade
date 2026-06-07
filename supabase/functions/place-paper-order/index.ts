import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveFillPrice, validateOrder, type Position } from "../_shared/paper-account.ts";
import { fetchQuote } from "../_shared/quote.ts";
import { settleFill } from "../_shared/settle-fill.ts";
import { nextTrailingStop, refPrice, type WorkingOrder } from "../_shared/paper-orders.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reject = (m: string, s = 400) =>
  new Response(JSON.stringify({ success: false, error: m }), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function normType(t: string): WorkingOrder["orderType"] {
  const x = (t || "market").toLowerCase();
  if (x === "stop_limit" || x === "stoplimit") return "stop_limit";
  if (x === "trailing_stop" || x === "trailing" || x === "trail") return "trailing_stop";
  if (x === "limit") return "limit";
  if (x === "stop") return "stop";
  return "market";
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return reject('Unauthorized', 401);

    const body = await req.json();
    const { symbol, action, quantity, strike, side, expiration, isStock, notes,
      limitPrice, stopPrice, trailAmount, trailPercent, timeInForce, ocoGroup, parentOrderId, status: requestedStatus } = body;
    if (!symbol || !action || !quantity) return reject('Missing required fields');
    if (action !== 'buy' && action !== 'sell') return reject('action must be "buy" or "sell"');
    const qty = Number(quantity);
    if (!(qty > 0)) return reject('quantity must be positive');
    const orderType = normType(body.orderType);
    const tif = (timeInForce === 'GTC' || timeInForce === 'GOOD_TILL_CANCEL') ? 'GTC' : 'DAY';
    const initStatus = requestedStatus === 'pending_parent' ? 'pending_parent' : 'working';

    const isOption = !isStock && strike && strike !== '0' && strike !== 0 && side;
    const mult = isOption ? 100 : 1;
    const contractKey = isOption ? `${side} ${strike} ${expiration || ''}`.trim() : null;

    let { data: account, error: accErr } = await supabase
      .from('paper_trading_accounts').select('*').eq('user_id', user.id).single();
    if (accErr && accErr.code === 'PGRST116') {
      const { data: created } = await supabase.from('paper_trading_accounts').insert({ user_id: user.id }).select().single();
      account = created;
    } else if (accErr) throw accErr;

    const { data: allRows } = await supabase.from('paper_positions').select('*').eq('account_id', account.id);
    const keyMatch = (p: any) => p.symbol === symbol && (p.contract_key ?? null) === (contractKey ?? null);
    const existingRow = (allRows || []).find(keyMatch) || null;
    const existing: Position | null = existingRow
      ? { qty: Number(existingRow.quantity), avgCost: Number(existingRow.avg_cost), mult } : null;
    const others: Position[] = (allRows || []).filter((p: any) => !keyMatch(p))
      .map((p: any) => ({ qty: Number(p.quantity), avgCost: Number(p.avg_cost), mult: Number(p.multiplier) }));

    // ---- MARKET: fill now ----
    if (orderType === 'market') {
      const quote = await fetchQuote(supabase, user.id, symbol);
      if (!quote) return reject(`Unable to get a live quote for ${symbol}. Order not filled.`);
      const fillPrice = resolveFillPrice(action, quote, 0);
      if (!fillPrice || fillPrice <= 0) return reject(`No tradable price for ${symbol}.`);
      const check = validateOrder(Number(account.balance), existing, action, qty, fillPrice, mult, others);
      if (!check.ok) return reject(check.reason);
      const res = await settleFill({ supabase, userId: user.id, account, symbol, contractKey, mult, side: action, qty, fillPrice, notes, existingRow });
      return new Response(JSON.stringify({ success: true, status: 'filled', fillPrice, trade: res.trade, realizedPnl: res.fill.realized, newBalance: res.newCash }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- WORKING ORDER ----
    let refForBp = Number(limitPrice) || Number(stopPrice) || 0;
    let initWatermark: number | null = null;
    let initStop: number | null = Number(stopPrice) || null;

    if (orderType === 'trailing_stop' || !refForBp) {
      const quote = await fetchQuote(supabase, user.id, symbol);
      const rp = quote ? refPrice(quote) : null;
      if (rp) {
        if (!refForBp) refForBp = rp;
        if (orderType === 'trailing_stop') {
          const t = nextTrailingStop({ orderType, side: action, trailAmount: Number(trailAmount) || null, trailPercent: Number(trailPercent) || null }, quote!);
          if (t) { initWatermark = t.watermark; initStop = t.stopPrice; }
        }
      }
      if (!refForBp) return reject('Could not determine a price to validate the order.');
    }

    const check = validateOrder(Number(account.balance), existing, action, qty, refForBp, mult, others);
    if (!check.ok) return reject(check.reason);

    const { data: order, error: orderErr } = await supabase.from('paper_orders').insert({
      user_id: user.id, account_id: account.id, symbol, contract_key: contractKey, multiplier: mult,
      side: action, order_type: orderType, quantity: qty,
      limit_price: Number(limitPrice) || null, stop_price: initStop,
      trail_amount: Number(trailAmount) || null, trail_percent: Number(trailPercent) || null,
      watermark: initWatermark, time_in_force: tif, status: initStatus,
      oco_group: ocoGroup || null, parent_order_id: parentOrderId || null, notes: notes || null,
    }).select().single();
    if (orderErr) throw orderErr;

    return new Response(JSON.stringify({ success: true, status: initStatus, order }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('place-paper-order error:', e);
    return reject(e instanceof Error ? e.message : 'Unknown error');
  }
});
