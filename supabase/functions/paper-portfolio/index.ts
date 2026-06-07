import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unrealizedPnl, marketValue, buyingPower, liveEquity, type Position } from "../_shared/paper-account.ts";
import { fetchQuote } from "../_shared/quote.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: account } = await supabase
      .from('paper_trading_accounts').select('*').eq('user_id', user.id).single();

    if (!account) {
      return new Response(JSON.stringify({
        cash: 100000, startingBalance: 100000, realizedPnl: 0, unrealizedPnl: 0,
        equity: 100000, buyingPower: 200000, positions: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: rows } = await supabase
      .from('paper_positions').select('*').eq('account_id', account.id);

    const positions: any[] = [];
    const liveList: Array<{ qty: number; mark: number; mult: number }> = [];
    let unrealizedTotal = 0;

    for (const r of rows || []) {
      const pos: Position = { qty: Number(r.quantity), avgCost: Number(r.avg_cost), mult: Number(r.multiplier) };
      const isOption = !!r.contract_key;

      // Stocks get a live mark; options fall back to cost (live option marking is Phase 3).
      let mark = pos.avgCost;
      let source = isOption ? 'cost (option marking: Phase 3)' : 'cost';
      if (!isOption) {
        const q = await fetchQuote(supabase, user.id, r.symbol);
        const m = q ? (q.mark || q.last || ((q.bid && q.ask) ? (q.bid + q.ask) / 2 : null)) : null;
        if (m && m > 0) { mark = m; source = q!.source; }
      }

      const upl = unrealizedPnl(pos, mark);
      unrealizedTotal += upl;
      liveList.push({ qty: pos.qty, mark, mult: pos.mult });
      positions.push({
        symbol: r.symbol,
        contractKey: r.contract_key,
        quantity: pos.qty,
        avgCost: pos.avgCost,
        multiplier: pos.mult,
        mark,
        marketValue: marketValue(pos.qty, mark, pos.mult),
        unrealizedPnl: upl,
        markSource: source,
      });
    }

    const cash = Number(account.balance);
    const positionsForBp: Position[] = (rows || []).map((r: any) => ({
      qty: Number(r.quantity), avgCost: Number(r.avg_cost), mult: Number(r.multiplier),
    }));

    return new Response(JSON.stringify({
      cash,
      startingBalance: Number(account.starting_balance),
      realizedPnl: Number(account.realized_pnl || 0),
      unrealizedPnl: unrealizedTotal,
      equity: liveEquity(cash, liveList),
      buyingPower: buyingPower(cash, positionsForBp),
      positions,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in paper-portfolio:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
