import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Strategy {
  id: string;
  user_id: string;
  symbol: string;
  side: 'long' | 'short';
  entry_price: number;
  quantity: number;
  state: string;
  enabled: boolean;
  profit_trigger_type: string;
  profit_trigger_value: number;
  profit_trigger_unit: string;
  trigger_once: boolean;
  stop_set_mode: string;
  stop_set_value: number | null;
  stop_set_lock: boolean;
  stop_set_rounding: string;
  enable_trailing: boolean;
  trailing_type: string | null;
  trailing_amount: number | null;
  trail_step_type: string | null;
  trail_step_value: number | null;
  trail_reference: string | null;
  trail_never_loosen: boolean;
  max_order_updates_per_minute: number;
  current_stop_price: number | null;
  reference_price: number | null;
  triggered_at: string | null;
  last_update_at: string | null;
}

// Calculate stop price based on mode
function calculateStopPrice(
  strategy: Strategy,
  currentPrice: number,
  atr = 1
): number {
  const { entry_price, side, stop_set_mode, stop_set_value } = strategy;
  const isLong = side === 'long';
  const v = stop_set_value ?? 0;

  switch (stop_set_mode) {
    case 'BREAKEVEN':
      return entry_price;
    case 'BREAKEVEN_PLUS':
      return isLong ? entry_price + v : entry_price - v;
    case 'FIXED_PRICE':
      return v;
    case 'PERCENT_FROM_ENTRY':
      return isLong 
        ? entry_price * (1 - v / 100) 
        : entry_price * (1 + v / 100);
    case 'PERCENT_FROM_CURRENT':
      return isLong 
        ? currentPrice * (1 - v / 100) 
        : currentPrice * (1 + v / 100);
    case 'DOLLAR_FROM_ENTRY':
      return isLong ? entry_price - v : entry_price + v;
    case 'ATR_MULTIPLE':
      return isLong 
        ? currentPrice - (atr * v) 
        : currentPrice + (atr * v);
    default:
      return entry_price;
  }
}

// Apply rounding to price
function applyRounding(price: number, rounding: string, tickSize = 0.01): number {
  switch (rounding) {
    case 'TICK_SIZE':
      return Math.round(price / tickSize) * tickSize;
    case 'CENT':
      return Math.round(price * 100) / 100;
    case 'NONE':
    default:
      return price;
  }
}

// Check if profit trigger is met
function isProfitTriggerMet(
  strategy: Strategy,
  currentPrice: number
): boolean {
  const { side, entry_price, quantity, profit_trigger_type, profit_trigger_value, profit_trigger_unit } = strategy;
  const isLong = side === 'long';

  if (profit_trigger_type === 'PRICE_LEVEL') {
    return isLong 
      ? currentPrice >= profit_trigger_value
      : currentPrice <= profit_trigger_value;
  }

  // Calculate P/L
  const priceMove = isLong 
    ? currentPrice - entry_price 
    : entry_price - currentPrice;
  
  const unrealizedPL = priceMove * quantity * 100; // Options: 100 shares per contract
  
  if (profit_trigger_unit === 'DOLLAR') {
    return unrealizedPL >= profit_trigger_value;
  } else {
    const pctGain = (priceMove / entry_price) * 100;
    return pctGain >= profit_trigger_value;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get prices from request body (if provided by external price feed)
    let prices: Record<string, number> = {};
    try {
      const body = await req.json();
      prices = body.prices || {};
    } catch {
      // No body provided, will fetch prices
    }

    // Fetch all active (ARMED or TRAILING_ACTIVE) strategies
    const { data: strategies, error: fetchError } = await supabase
      .from('phroureo_exit_strategies')
      .select('*')
      .eq('enabled', true)
      .in('state', ['ARMED', 'TRIGGERED_STOP_SET', 'TRAILING_ACTIVE']);

    if (fetchError) throw fetchError;

    if (!strategies || strategies.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: 'No active strategies' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${strategies.length} active strategies`);

    const results: any[] = [];
    const now = new Date().toISOString();

    for (const strategy of strategies as Strategy[]) {
      try {
        // Get current price for symbol (from provided prices or mock)
        let currentPrice = prices[strategy.symbol];
        
        // If no price provided, we need to skip (in production, would fetch from data feed)
        if (!currentPrice) {
          console.log(`No price for ${strategy.symbol}, skipping`);
          continue;
        }

        const isLong = strategy.side === 'long';

        // State machine processing
        switch (strategy.state) {
          case 'ARMED': {
            // Check if profit trigger is met
            if (isProfitTriggerMet(strategy, currentPrice)) {
              console.log(`Trigger hit for ${strategy.symbol} at ${currentPrice}`);
              
              // Calculate new stop price
              let newStop = calculateStopPrice(strategy, currentPrice);
              newStop = applyRounding(newStop, strategy.stop_set_rounding);

              // Apply lock (never loosen) if existing stop
              if (strategy.stop_set_lock && strategy.current_stop_price) {
                if (isLong) {
                  newStop = Math.max(newStop, strategy.current_stop_price);
                } else {
                  newStop = Math.min(newStop, strategy.current_stop_price);
                }
              }

              // Determine next state
              const nextState = strategy.enable_trailing 
                ? 'TRAILING_ACTIVE' 
                : 'TRIGGERED_STOP_SET';

              // Update strategy
              const { error: updateError } = await supabase
                .from('phroureo_exit_strategies')
                .update({
                  state: nextState,
                  current_stop_price: newStop,
                  reference_price: currentPrice,
                  triggered_at: now,
                  last_update_at: now,
                })
                .eq('id', strategy.id);

              if (updateError) throw updateError;

              // Log event
              await supabase.from('phroureo_strategy_events').insert({
                strategy_id: strategy.id,
                event_type: 'TRIGGER_HIT',
                previous_state: 'ARMED',
                new_state: nextState,
                previous_stop: strategy.current_stop_price,
                new_stop: newStop,
                trigger_price: currentPrice,
                reason: `Profit trigger hit at $${currentPrice.toFixed(2)}. Stop set to $${newStop.toFixed(2)}`,
              });

              results.push({
                id: strategy.id,
                symbol: strategy.symbol,
                action: 'TRIGGER_HIT',
                newStop,
                newState: nextState,
              });
            }
            break;
          }

          case 'TRIGGERED_STOP_SET':
          case 'TRAILING_ACTIVE': {
            if (!strategy.enable_trailing) break;

            // Update reference price (highest for long, lowest for short)
            let referencePrice = strategy.reference_price || currentPrice;
            if (isLong) {
              referencePrice = Math.max(referencePrice, currentPrice);
            } else {
              referencePrice = Math.min(referencePrice, currentPrice);
            }

            // Calculate ideal trail stop
            const trailAmount = strategy.trailing_amount || 0;
            let idealStop: number;
            
            if (strategy.trailing_type === 'PERCENT') {
              idealStop = isLong
                ? referencePrice * (1 - trailAmount / 100)
                : referencePrice * (1 + trailAmount / 100);
            } else {
              idealStop = isLong
                ? referencePrice - trailAmount
                : referencePrice + trailAmount;
            }

            idealStop = applyRounding(idealStop, strategy.stop_set_rounding);

            // Check if we should update (step value met)
            const stepValue = strategy.trail_step_value || 0;
            let shouldUpdate = false;
            
            if (stepValue > 0 && strategy.reference_price) {
              const priceMoved = Math.abs(referencePrice - strategy.reference_price);
              
              if (strategy.trail_step_type === 'PERCENT_STEP') {
                const pctMoved = (priceMoved / strategy.reference_price) * 100;
                shouldUpdate = pctMoved >= stepValue;
              } else if (strategy.trail_step_type === 'DOLLAR_STEP') {
                shouldUpdate = priceMoved >= stepValue;
              } else {
                // TICK_STEP
                shouldUpdate = priceMoved >= (stepValue * 0.01);
              }
            } else {
              shouldUpdate = true;
            }

            // Apply never loosen rule
            let newStop = idealStop;
            if (strategy.trail_never_loosen && strategy.current_stop_price) {
              if (isLong) {
                newStop = Math.max(newStop, strategy.current_stop_price);
              } else {
                newStop = Math.min(newStop, strategy.current_stop_price);
              }
            }

            // Check if stop actually changed
            const stopChanged = strategy.current_stop_price 
              ? Math.abs(newStop - strategy.current_stop_price) > 0.001
              : true;

            if (shouldUpdate && stopChanged) {
              // Rate limiting check
              const lastUpdate = strategy.last_update_at 
                ? new Date(strategy.last_update_at).getTime() 
                : 0;
              const minInterval = 60000 / strategy.max_order_updates_per_minute;
              const canUpdate = Date.now() - lastUpdate >= minInterval;

              if (canUpdate) {
                const { error: updateError } = await supabase
                  .from('phroureo_exit_strategies')
                  .update({
                    state: 'TRAILING_ACTIVE',
                    current_stop_price: newStop,
                    reference_price: referencePrice,
                    last_update_at: now,
                  })
                  .eq('id', strategy.id);

                if (updateError) throw updateError;

                await supabase.from('phroureo_strategy_events').insert({
                  strategy_id: strategy.id,
                  event_type: 'TRAIL_STEP',
                  previous_state: strategy.state,
                  new_state: 'TRAILING_ACTIVE',
                  previous_stop: strategy.current_stop_price,
                  new_stop: newStop,
                  trigger_price: currentPrice,
                  reason: `Trail step: stop moved to $${newStop.toFixed(2)} (ref: $${referencePrice.toFixed(2)})`,
                });

                results.push({
                  id: strategy.id,
                  symbol: strategy.symbol,
                  action: 'TRAIL_STEP',
                  newStop,
                  referencePrice,
                });
              }
            } else if (referencePrice !== strategy.reference_price) {
              // Just update reference price
              await supabase
                .from('phroureo_exit_strategies')
                .update({ reference_price: referencePrice })
                .eq('id', strategy.id);
            }
            break;
          }
        }
      } catch (strategyError: any) {
        console.error(`Error processing strategy ${strategy.id}:`, strategyError);
        
        // Log error event
        await supabase.from('phroureo_strategy_events').insert({
          strategy_id: strategy.id,
          event_type: 'ERROR',
          reason: strategyError.message,
          metadata: { error: strategyError.toString() },
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        processed: strategies.length, 
        updated: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Phroureo engine error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
