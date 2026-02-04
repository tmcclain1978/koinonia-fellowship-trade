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

    const { symbol, action, quantity, price, strike, side, expiration, notes, isStock } = await req.json();

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

    // Detect if this is an options trade based on strike/side or explicit isStock flag
    const isOptionsTradeDetected = !isStock && strike && strike !== '0' && strike !== 0 && side;
    const multiplier = isOptionsTradeDetected ? 100 : 1;
    
    // Build contract key for matching (only for options)
    const contractKey = isOptionsTradeDetected ? `${side} ${strike} ${expiration || ''}`.trim() : null;
    
    const totalValue = Number(quantity) * Number(price) * multiplier;
    let profitLoss = null;

    // Check if user has enough balance for buy
    if (action === 'buy' && account.balance < totalValue) {
      throw new Error('Insufficient balance');
    }

    // Calculate profit/loss for sell orders using FIFO matching
    if (action === 'sell') {
      let matchQuery = supabase
        .from('paper_trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('symbol', symbol)
        .eq('action', 'buy')
        .order('executed_at', { ascending: true }); // FIFO ordering

      // For options, match by exact contract specification
      if (isOptionsTradeDetected && contractKey) {
        matchQuery = matchQuery.eq('notes', contractKey);
      }

      const { data: matchingBuys, error: matchError } = await matchQuery;

      if (matchError) {
        console.error('Error finding matching buys:', matchError);
      }

      if (matchingBuys && matchingBuys.length > 0) {
        // Calculate weighted average entry price using FIFO
        let remainingQtyToSell = Number(quantity);
        let totalCostBasis = 0;
        let qtyMatched = 0;

        for (const buy of matchingBuys) {
          if (remainingQtyToSell <= 0) break;
          
          const buyQty = Number(buy.quantity);
          const qtyToUse = Math.min(buyQty, remainingQtyToSell);
          
          totalCostBasis += Number(buy.price) * qtyToUse;
          qtyMatched += qtyToUse;
          remainingQtyToSell -= qtyToUse;
        }

        if (qtyMatched > 0) {
          const avgEntryPrice = totalCostBasis / qtyMatched;
          // P/L = (sell price - avg entry price) * quantity * multiplier
          profitLoss = (Number(price) - avgEntryPrice) * Number(quantity) * multiplier;
          
          console.log('P/L Calculation:', {
            symbol,
            contractKey,
            avgEntryPrice,
            sellPrice: Number(price),
            quantity: Number(quantity),
            multiplier,
            profitLoss,
            matchedBuys: matchingBuys.length,
          });
        }
      } else {
        console.log('No matching buy trades found for:', { symbol, contractKey });
        // If no matching buys found, calculate P/L as just the sell value
        // This handles edge cases where buy trades may have been deleted or not tracked
        profitLoss = 0;
      }
    }

    // Update account balance
    const newBalance = action === 'buy' 
      ? account.balance - totalValue 
      : account.balance + totalValue;

    await supabase
      .from('paper_trading_accounts')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', account.id);

    // Build notes for trade record
    const tradeNotes = notes || contractKey || symbol;

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
        notes: tradeNotes,
      })
      .select()
      .single();

    if (tradeError) throw tradeError;

    // Log to bot performance for learning (both opens and closes)
    const performanceLog: Record<string, unknown> = {
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
      performanceLog.actual_rr = totalValue > 0 ? profitLoss / totalValue : null;
      
      // Simple execution quality score based on profit
      performanceLog.execution_quality_score = profitLoss > 0 ? 85 : 50;
      performanceLog.discipline_score = 75; // Default for paper trades
    }

    // Insert into bot_performance_log for learning
    await supabase
      .from('bot_performance_log')
      .insert(performanceLog);

    // Auto-create trading journal entry
    const journalContent = action === 'buy' 
      ? `Opened position: ${action.toUpperCase()} ${quantity} ${symbol} @ $${price}. ${tradeNotes}`
      : `Closed position: ${action.toUpperCase()} ${quantity} ${symbol} @ $${price}. P&L: ${profitLoss !== null ? (profitLoss >= 0 ? '+' : '') + '$' + profitLoss.toFixed(2) : 'N/A'}. ${tradeNotes}`;
    
    await supabase
      .from('trading_journal')
      .insert({
        user_id: user.id,
        entry_type: 'trade',
        symbol,
        trade_id: trade.id,
        content: journalContent,
        entry_date: new Date().toISOString().split('T')[0],
      });

    console.log('Paper trade executed:', { symbol, action, quantity, price, profitLoss, newBalance });

    return new Response(
      JSON.stringify({ 
        success: true, 
        trade,
        newBalance,
        profitLoss,
        journalLogged: true,
        multiplierUsed: multiplier,
        isOptions: isOptionsTradeDetected,
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
