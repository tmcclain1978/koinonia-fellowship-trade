import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { symbol, action, quantity, price, strike, side, expiration, notes } = await req.json();

    if (!symbol || !action || !quantity || !price) {
      throw new Error('Missing required fields');
    }

    // Get or create paper trading account
    let { data: account, error: accountError } = await supabase
      .from('paper_trading_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (accountError && accountError.code === 'PGRST116') {
      // Create new account if doesn't exist
      const { data: newAccount, error: createError } = await supabase
        .from('paper_trading_accounts')
        .insert({ user_id: user.id })
        .select()
        .single();

      if (createError) throw createError;
      account = newAccount;
    }

    const totalValue = Number(quantity) * Number(price) * 100; // Options contract multiplier
    let profitLoss = null;

    // Check if user has enough balance for buy
    if (action === 'buy' && account.balance < totalValue) {
      throw new Error('Insufficient balance');
    }

    // Calculate profit/loss for sell orders
    if (action === 'sell') {
      const { data: buyTrades } = await supabase
        .from('paper_trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('symbol', symbol)
        .eq('action', 'buy')
        .order('executed_at', { ascending: true });

      if (buyTrades && buyTrades.length > 0) {
        const avgBuyPrice = buyTrades.reduce((sum, t) => sum + Number(t.price), 0) / buyTrades.length;
        profitLoss = (Number(price) - avgBuyPrice) * Number(quantity) * 100;
      }
    }

    // Update account balance
    const newBalance = action === 'buy' 
      ? account.balance - totalValue 
      : account.balance + totalValue;

    await supabase
      .from('paper_trading_accounts')
      .update({ balance: newBalance })
      .eq('id', account.id);

    // Insert trade record
    const { data: trade, error: tradeError } = await supabase
      .from('paper_trades')
      .insert({
        user_id: user.id,
        account_id: account.id,
        symbol,
        action,
        quantity: Number(quantity),
        price: Number(price),
        total_value: totalValue,
        profit_loss: profitLoss,
        notes: notes || `${side} ${strike} ${expiration}`
      })
      .select()
      .single();

    if (tradeError) throw tradeError;

    // Log to bot performance for learning (both opens and closes)
    // This helps train the bot with real user trading behavior
    const performanceLog: any = {
      user_id: user.id,
      trade_id: trade.id,
      symbol,
      strategy: action === 'buy' ? 'paper_buy' : 'paper_sell',
      entry_price: Number(price),
      quantity: Number(quantity),
      trade_opened_at: new Date().toISOString(),
    };

    // If it's a sell (close), calculate performance metrics
    if (action === 'sell' && profitLoss !== null) {
      performanceLog.exit_price = Number(price);
      performanceLog.trade_closed_at = new Date().toISOString();
      performanceLog.profit_factor = profitLoss > 0 ? (profitLoss / totalValue) * 100 : null;
      performanceLog.actual_rr = profitLoss / totalValue; // Risk-reward ratio
      
      // Simple execution quality score based on profit
      performanceLog.execution_quality_score = profitLoss > 0 ? 85 : 50;
      performanceLog.discipline_score = 75; // Default for paper trades
    }

    // Insert into bot_performance_log for learning
    await supabase
      .from('bot_performance_log')
      .insert(performanceLog);

    return new Response(
      JSON.stringify({ 
        success: true, 
        trade,
        newBalance,
        profitLoss
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in execute-paper-trade:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});