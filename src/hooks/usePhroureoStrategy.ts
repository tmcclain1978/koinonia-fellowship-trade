import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  PhroureoExitStrategy, 
  PhroureoStrategyInput,
  PositionType 
} from '@/components/phroureo/phroureoTypes';

interface UsePhroureoStrategyOptions {
  positionId?: string;
  positionType?: PositionType;
  autoFetch?: boolean;
}

export function usePhroureoStrategy(options: UsePhroureoStrategyOptions = {}) {
  const { positionId, positionType = 'paper', autoFetch = true } = options;
  const { toast } = useToast();
  
  const [strategy, setStrategy] = useState<PhroureoExitStrategy | null>(null);
  const [strategies, setStrategies] = useState<PhroureoExitStrategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch strategy for a specific position
  const fetchStrategyForPosition = useCallback(async () => {
    if (!positionId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase
        .from('phroureo_exit_strategies')
        .select('*')
        .eq('position_id', positionId)
        .eq('position_type', positionType)
        .maybeSingle();

      if (fetchError) throw fetchError;
      setStrategy(data as PhroureoExitStrategy | null);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching strategy:', err);
    } finally {
      setLoading(false);
    }
  }, [positionId, positionType]);

  // Fetch all strategies for the current user
  const fetchAllStrategies = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: fetchError } = await supabase
        .from('phroureo_exit_strategies')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setStrategies((data || []) as PhroureoExitStrategy[]);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching strategies:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create a new strategy
  const createStrategy = async (
    config: PhroureoStrategyInput,
    posId?: string,
    posType: PositionType = 'paper'
  ): Promise<PhroureoExitStrategy | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const strategyData = {
        user_id: user.id,
        position_id: posId || config.position_id,
        position_type: posType,
        strategy_name: config.strategy_name || 'Phroureo Protection',
        symbol: config.symbol,
        side: config.side,
        entry_price: config.entry_price,
        quantity: config.quantity,
        contract_key: config.contract_key ?? null,
        multiplier: config.multiplier ?? 1,
        state: 'ARMED' as const,
        enabled: true,
        profit_trigger_type: config.profit_trigger_type,
        profit_trigger_value: config.profit_trigger_value,
        profit_trigger_unit: config.profit_trigger_unit,
        trigger_once: config.trigger_once ?? true,
        stop_set_mode: config.stop_set_mode,
        stop_set_value: config.stop_set_value,
        stop_set_lock: config.stop_set_lock ?? true,
        stop_set_rounding: config.stop_set_rounding ?? 'TICK_SIZE',
        enable_trailing: config.enable_trailing ?? false,
        trailing_type: config.trailing_type,
        trailing_amount: config.trailing_amount,
        trail_step_type: config.trail_step_type,
        trail_step_value: config.trail_step_value,
        trail_start_delay: config.trail_start_delay,
        trail_reference: config.trail_reference,
        trail_never_loosen: config.trail_never_loosen ?? true,
        max_order_updates_per_minute: config.max_order_updates_per_minute ?? 10,
        allow_after_hours: config.allow_after_hours ?? false,
        slippage_buffer: config.slippage_buffer,
      };

      const { data, error: insertError } = await supabase
        .from('phroureo_exit_strategies')
        .insert(strategyData)
        .select()
        .single();

      if (insertError) throw insertError;

      // Log creation event
      await supabase.from('phroureo_strategy_events').insert({
        strategy_id: data.id,
        event_type: 'CREATED',
        new_state: 'ARMED',
        reason: 'Strategy created and armed',
      });

      const typedData = data as PhroureoExitStrategy;
      setStrategy(typedData);
      
      toast({
        title: "Exit Strategy Created",
        description: `${config.strategy_name || 'Phroureo Protection'} is now active`,
      });

      return typedData;
    } catch (err: any) {
      setError(err.message);
      toast({
        title: "Error creating strategy",
        description: err.message,
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Update an existing strategy
  const updateStrategy = async (
    strategyId: string,
    updates: Partial<PhroureoStrategyInput>
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      const { error: updateError } = await supabase
        .from('phroureo_exit_strategies')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', strategyId);

      if (updateError) throw updateError;

      // Log update event
      await supabase.from('phroureo_strategy_events').insert({
        strategy_id: strategyId,
        event_type: 'MANUAL_EDIT',
        reason: 'Strategy configuration updated',
      });

      // Refresh data
      if (positionId) {
        await fetchStrategyForPosition();
      } else {
        await fetchAllStrategies();
      }

      toast({
        title: "Strategy Updated",
        description: "Your exit strategy has been updated",
      });

      return true;
    } catch (err: any) {
      setError(err.message);
      toast({
        title: "Error updating strategy",
        description: err.message,
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Delete a strategy
  const deleteStrategy = async (strategyId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      const { error: deleteError } = await supabase
        .from('phroureo_exit_strategies')
        .delete()
        .eq('id', strategyId);

      if (deleteError) throw deleteError;

      setStrategy(null);
      setStrategies(prev => prev.filter(s => s.id !== strategyId));

      toast({
        title: "Strategy Deleted",
        description: "Your exit strategy has been removed",
      });

      return true;
    } catch (err: any) {
      setError(err.message);
      toast({
        title: "Error deleting strategy",
        description: err.message,
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Pause/Resume a strategy
  const toggleStrategyEnabled = async (strategyId: string, enabled: boolean): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      const { error: updateError } = await supabase
        .from('phroureo_exit_strategies')
        .update({ 
          enabled,
          state: enabled ? 'ARMED' : 'INACTIVE',
        })
        .eq('id', strategyId);

      if (updateError) throw updateError;

      // Log event
      await supabase.from('phroureo_strategy_events').insert({
        strategy_id: strategyId,
        event_type: enabled ? 'RESUMED' : 'PAUSED',
        new_state: enabled ? 'ARMED' : 'INACTIVE',
        reason: enabled ? 'Strategy resumed by user' : 'Strategy paused by user',
      });

      // Refresh data
      if (positionId) {
        await fetchStrategyForPosition();
      } else {
        await fetchAllStrategies();
      }

      toast({
        title: enabled ? "Strategy Resumed" : "Strategy Paused",
        description: enabled 
          ? "Your exit strategy is now active" 
          : "Your exit strategy has been paused",
      });

      return true;
    } catch (err: any) {
      setError(err.message);
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to realtime updates
  useEffect(() => {
    if (!autoFetch) return;

    const fetchData = positionId ? fetchStrategyForPosition : fetchAllStrategies;
    fetchData();

    // Set up realtime subscription
    const channel = supabase
      .channel('phroureo-strategies')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'phroureo_exit_strategies',
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [positionId, positionType, autoFetch, fetchStrategyForPosition, fetchAllStrategies]);

  return {
    strategy,
    strategies,
    loading,
    error,
    createStrategy,
    updateStrategy,
    deleteStrategy,
    toggleStrategyEnabled,
    refresh: positionId ? fetchStrategyForPosition : fetchAllStrategies,
  };
}
