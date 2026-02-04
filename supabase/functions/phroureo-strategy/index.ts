import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    
    // Route based on method
    switch (req.method) {
      case 'GET': {
        if (path === 'events') {
          // Get events for a strategy
          const strategyId = url.searchParams.get('strategy_id');
          if (!strategyId) {
            return new Response(
              JSON.stringify({ error: 'strategy_id required' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const { data, error } = await supabase
            .from('phroureo_strategy_events')
            .select('*')
            .eq('strategy_id', strategyId)
            .order('created_at', { ascending: false })
            .limit(100);

          if (error) throw error;
          return new Response(
            JSON.stringify({ events: data }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get strategy by ID or position_id
        const strategyId = url.searchParams.get('id');
        const positionId = url.searchParams.get('position_id');
        
        if (strategyId) {
          const { data, error } = await supabase
            .from('phroureo_exit_strategies')
            .select('*')
            .eq('id', strategyId)
            .eq('user_id', user.id)
            .single();

          if (error) throw error;
          return new Response(
            JSON.stringify({ strategy: data }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (positionId) {
          const { data, error } = await supabase
            .from('phroureo_exit_strategies')
            .select('*')
            .eq('position_id', positionId)
            .eq('user_id', user.id)
            .maybeSingle();

          if (error) throw error;
          return new Response(
            JSON.stringify({ strategy: data }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get all strategies for user
        const { data, error } = await supabase
          .from('phroureo_exit_strategies')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return new Response(
          JSON.stringify({ strategies: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'POST': {
        if (path === 'pause') {
          const { strategy_id } = await req.json();
          
          const { data, error } = await supabase
            .from('phroureo_exit_strategies')
            .update({ enabled: false, state: 'INACTIVE' })
            .eq('id', strategy_id)
            .eq('user_id', user.id)
            .select()
            .single();

          if (error) throw error;

          await supabase.from('phroureo_strategy_events').insert({
            strategy_id,
            event_type: 'PAUSED',
            previous_state: data.state,
            new_state: 'INACTIVE',
            reason: 'Strategy paused by user',
          });

          return new Response(
            JSON.stringify({ success: true, strategy: data }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (path === 'resume') {
          const { strategy_id } = await req.json();
          
          const { data, error } = await supabase
            .from('phroureo_exit_strategies')
            .update({ enabled: true, state: 'ARMED' })
            .eq('id', strategy_id)
            .eq('user_id', user.id)
            .select()
            .single();

          if (error) throw error;

          await supabase.from('phroureo_strategy_events').insert({
            strategy_id,
            event_type: 'RESUMED',
            previous_state: 'INACTIVE',
            new_state: 'ARMED',
            reason: 'Strategy resumed by user',
          });

          return new Response(
            JSON.stringify({ success: true, strategy: data }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create new strategy
        const body = await req.json();
        
        const strategyData = {
          user_id: user.id,
          position_id: body.position_id,
          position_type: body.position_type || 'paper',
          strategy_name: body.strategy_name || 'Phroureo Protection',
          symbol: body.symbol,
          side: body.side,
          entry_price: body.entry_price,
          quantity: body.quantity || 1,
          state: 'ARMED',
          enabled: true,
          profit_trigger_type: body.profit_trigger_type || 'UNREALIZED_PL',
          profit_trigger_value: body.profit_trigger_value || 50,
          profit_trigger_unit: body.profit_trigger_unit || 'DOLLAR',
          trigger_once: body.trigger_once ?? true,
          stop_set_mode: body.stop_set_mode || 'BREAKEVEN',
          stop_set_value: body.stop_set_value,
          stop_set_lock: body.stop_set_lock ?? true,
          stop_set_rounding: body.stop_set_rounding || 'TICK_SIZE',
          enable_trailing: body.enable_trailing ?? false,
          trailing_type: body.trailing_type,
          trailing_amount: body.trailing_amount,
          trail_step_type: body.trail_step_type,
          trail_step_value: body.trail_step_value,
          trail_start_delay: body.trail_start_delay,
          trail_reference: body.trail_reference,
          trail_never_loosen: body.trail_never_loosen ?? true,
          max_order_updates_per_minute: body.max_order_updates_per_minute || 10,
          allow_after_hours: body.allow_after_hours ?? false,
          slippage_buffer: body.slippage_buffer,
        };

        const { data, error } = await supabase
          .from('phroureo_exit_strategies')
          .insert(strategyData)
          .select()
          .single();

        if (error) throw error;

        // Log creation event
        await supabase.from('phroureo_strategy_events').insert({
          strategy_id: data.id,
          event_type: 'CREATED',
          new_state: 'ARMED',
          reason: 'Strategy created and armed',
        });

        return new Response(
          JSON.stringify({ success: true, strategy: data }),
          { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'PUT': {
        const body = await req.json();
        const { id, ...updates } = body;

        if (!id) {
          return new Response(
            JSON.stringify({ error: 'Strategy ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('phroureo_exit_strategies')
          .update(updates)
          .eq('id', id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) throw error;

        await supabase.from('phroureo_strategy_events').insert({
          strategy_id: id,
          event_type: 'MANUAL_EDIT',
          reason: 'Strategy configuration updated',
        });

        return new Response(
          JSON.stringify({ success: true, strategy: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'DELETE': {
        const strategyId = url.searchParams.get('id');
        
        if (!strategyId) {
          return new Response(
            JSON.stringify({ error: 'Strategy ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error } = await supabase
          .from('phroureo_exit_strategies')
          .delete()
          .eq('id', strategyId)
          .eq('user_id', user.id);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: any) {
    console.error('Phroureo strategy error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
