import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolveFillPrice, applyFill, cashDelta, validateOrder,
  type Position, type Quote,
} from "../_shared/paper-account.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function reject(message: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Fetch a real quote server-side. Tries Schwab, then Alpaca. Never trusts a
// client-supplied price. Returns a normalized Quote or null if unavailable.
async function fetchQuote(supabase: any, userId: string, symbol: string): Promise<Quote | null> {
  try {
    const { data } = await supabase.functions.invoke("schwab-quotes", { body: { symbols: [symbol], userId } });
    const q = data?.quotes?.[symbol];
    if (q) {
      const quote: Quote = { bid: q.bidPrice ?? null, ask: q.askPrice ?? null, last: q.lastPrice ?? null, mark: q.mark ?? null };
      if (quote.bid || quote.ask || quote.last || quote.mark) return quote;
    }
  } catch (_) { /* fall through to Alpaca */ }
  try {
    const { data } = await supabase.functions.invoke("alpaca-quotes", { body: { symbols: [symbol] } });
    const lq = data?.quotes?.[0]?.latestQuote;
    if (lq && (lq.ap || lq.bp)) {
      return { bid: lq.bp ?? null, ask: lq.ap ?? null, last: (lq.ap && lq.bp) ? (lq.ap + lq.bp) / 2 : null, mark: null };
    }
  } catch (_) { /* no quote available */ }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return reject('Unauthorized', 401);

    const { symbol, action, quantity, strike, side, expiration, isStock, notes, slippageBps } = await req.json();
    if (!symbol || !action || !quantity) return reject('Missing required fields');
    if (action !== 'buy' && action !== 'sell') return reject('action must be "buy" or "sell"');
    const qty = Number(quantity);
    if (!(qty > 0)) return reject('quantity must be a positive number');

    // Options vs stock (single-leg options carry strike/side; full multi-leg is Phase 3)
    const isOption = !isStock && strike && strike !== '0' && strike !== 0 && side;
    const mult = isOption ? 100 : 1;
    const contractKey = isOption ? `${side} ${strike} ${expiration || ''}`.trim() : null;

    // Get or create the paper account
    let { data: account, error: accErr } = await supabase
      .from('paper_trading_accounts').select('*').eq('user_id', user.id).single();
    if (accErr && accErr.code === 'PGRST116') {
      const { data: created, error: createErr } = await supabase
        .from('paper_trading_accounts').insert({ user_id: user.id }).select().single();
      if (createErr) throw createErr;
      account = created;
    } else if (accErr) {
      throw accErr;
    }

    // REAL quote — the fill price comes from the market, not the client.
    const quote = await fetchQuote(supabase, user.id, symbol);
    if (!quote) return reject(`Unable to get a live quote for ${symbol}. Order not filled.`);
    const fillPrice = resolveFillPrice(action, quote, Number(slippageBps) || 0);
    if (!fillPrice || fillPrice <= 0) return reject(`No tradable price available for ${symbol}.`);

    // Load positions for this account
    const { data: allRows } = await supabase
      .from('paper_positions').select('*').eq('account_id', account.id);
    const keyMatch = (p: any) => p.symbol === symbol && (p.contract_key ?? null) === (contractKey ?? null);
    const existingRow = (allRows || []).find(keyMatch) || null;
    const existing: Position | null = existingRow
      ? { qty: Number(existingRow.quantity), avgCost: Number(existingRow.avg_cost), mult }
      : null;
    const others: Position[] = (allRows || []).filter((p: any) => !keyMatch(p))
      .map((p: any) => ({ qty: Number(p.quantity), avgCost: Number(p.avg_cost), mult: Number(p.multiplier) }));

    // Buying-power check (includes legitimate shorting; closing is never blocked)
    const check = validateOrder(Number(account.balance), existing, action, qty, fillPrice, mult, others);
    if (!check.ok) return reject(check.reason);

    // Apply the fill
    const delta = action === 'buy' ? qty : -qty;
    const fill = applyFill(existing ?? { qty: 0, avgCost: 0, mult }, delta, fillPrice, mult);
    const newCash = Number(account.balance) + cashDelta(action, qty, fillPrice, mult, 0);
    const newRealized = Number(account.realized_pnl || 0) + fill.realized;
    const nowIso = new Date().toISOString();

    // Persist account
    await supabase.from('paper_trading_accounts')
      .update({ balance: newCash, realized_pnl: newRealized, updated_at: nowIso })
      .eq('id', account.id);

    // Persist position (delete if flat, else update/insert)
    if (fill.qty === 0) {
      if (existingRow) await supabase.from('paper_positions').delete().eq('id', existingRow.id);
    } else if (existingRow) {
      await supabase.from('paper_positions')
        .update({ quantity: fill.qty, avg_cost: fill.avgCost, updated_at: nowIso })
        .eq('id', existingRow.id);
    } else {
      await supabase.from('paper_positions').insert({
        user_id: user.id, account_id: account.id, symbol, contract_key: contractKey,
        multiplier: mult, quantity: fill.qty, avg_cost: fill.avgCost,
      });
    }

    // Record the trade at the REAL fill price
    const totalValue = qty * fillPrice * mult;
    const tradeNotes = notes || contractKey || symbol;
    const { data: trade, error: tradeErr } = await supabase.from('paper_trades').insert({
      user_id: user.id, account_id: account.id, symbol, action,
      quantity: qty, price: fillPrice, total_value: totalValue,
      profit_loss: fill.realized !== 0 ? fill.realized : null, notes: tradeNotes,
    }).select().single();
    if (tradeErr) throw tradeErr;

    // Learning log (unchanged intent, real fill price)
    const perf: Record<string, unknown> = {
      user_id: user.id, trade_id: trade.id, symbol,
      strategy: action === 'buy' ? 'paper_buy' : 'paper_sell',
      entry_price: fillPrice, quantity: qty, trade_opened_at: nowIso,
    };
    if (fill.realized !== 0) {
      perf.exit_price = fillPrice;
      perf.trade_closed_at = nowIso;
      perf.profit_factor = fill.realized > 0 ? (fill.realized / totalValue) * 100 : null;
      perf.actual_rr = totalValue > 0 ? fill.realized / totalValue : null;
      perf.execution_quality_score = fill.realized > 0 ? 85 : 50;
      perf.discipline_score = 75;
    }
    await supabase.from('bot_performance_log').insert(perf);

    // Journal entry
    const journal = fill.realized !== 0
      ? `${action.toUpperCase()} ${qty} ${symbol} @ $${fillPrice.toFixed(2)} (filled from live quote). Realized P&L: ${fill.realized >= 0 ? '+' : ''}$${fill.realized.toFixed(2)}. ${tradeNotes}`
      : `${action.toUpperCase()} ${qty} ${symbol} @ $${fillPrice.toFixed(2)} (filled from live quote). ${tradeNotes}`;
    await supabase.from('trading_journal').insert({
      user_id: user.id, entry_type: 'trade', symbol, trade_id: trade.id,
      content: journal, entry_date: nowIso.split('T')[0],
    });

    return new Response(JSON.stringify({
      success: true,
      trade,
      fillPrice,
      newBalance: newCash,
      realizedPnl: fill.realized,
      position: fill.qty === 0 ? null : { quantity: fill.qty, avgCost: fill.avgCost },
      isOptions: !!isOption,
      multiplierUsed: mult,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in execute-paper-trade:', error);
    return reject(error instanceof Error ? error.message : 'Unknown error', 400);
  }
});
