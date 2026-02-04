import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Shield, 
  Play, 
  Pause, 
  Trash2, 
  Edit, 
  TrendingUp,
  TrendingDown,
  Target,
  AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import { 
  PhroureoExitStrategy, 
  STATE_BADGES,
  STOP_SET_MODE_LABELS,
  PhroureoStrategyInput,
  PositionSide 
} from "./phroureoTypes";
import { PhroureoStrategyBuilder } from "./PhroureoStrategyBuilder";
import { PhroureoAuditLog } from "./PhroureoAuditLog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface PhroureoPositionCardProps {
  strategy: PhroureoExitStrategy;
  currentPrice?: number;
  onUpdate?: () => void;
}

export function PhroureoPositionCard({ 
  strategy, 
  currentPrice,
  onUpdate 
}: PhroureoPositionCardProps) {
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const isLong = strategy.side === 'long';
  const stateBadge = STATE_BADGES[strategy.state];

  const handlePauseResume = async () => {
    setLoading(true);
    try {
      const newEnabled = !strategy.enabled;
      const newState = newEnabled ? 'ARMED' : 'INACTIVE';
      
      const { error } = await supabase
        .from('phroureo_exit_strategies')
        .update({ 
          enabled: newEnabled,
          state: strategy.state === 'INACTIVE' || strategy.state === 'ARMED' ? newState : strategy.state
        })
        .eq('id', strategy.id);

      if (error) throw error;

      // Log event
      await supabase.from('phroureo_strategy_events').insert({
        strategy_id: strategy.id,
        event_type: newEnabled ? 'RESUMED' : 'PAUSED',
        previous_state: strategy.state,
        new_state: newState,
        reason: newEnabled ? 'Strategy resumed by user' : 'Strategy paused by user',
      });

      toast({
        title: newEnabled ? "Strategy Resumed" : "Strategy Paused",
        description: newEnabled 
          ? "Your exit strategy is now active" 
          : "Your exit strategy has been paused",
      });

      onUpdate?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('phroureo_exit_strategies')
        .delete()
        .eq('id', strategy.id);

      if (error) throw error;

      toast({
        title: "Strategy Deleted",
        description: "Your exit strategy has been removed",
      });

      setDeleteDialogOpen(false);
      onUpdate?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (config: PhroureoStrategyInput) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('phroureo_exit_strategies')
        .update({
          strategy_name: config.strategy_name,
          profit_trigger_type: config.profit_trigger_type,
          profit_trigger_value: config.profit_trigger_value,
          profit_trigger_unit: config.profit_trigger_unit,
          trigger_once: config.trigger_once,
          stop_set_mode: config.stop_set_mode,
          stop_set_value: config.stop_set_value,
          stop_set_lock: config.stop_set_lock,
          stop_set_rounding: config.stop_set_rounding,
          enable_trailing: config.enable_trailing,
          trailing_type: config.trailing_type,
          trailing_amount: config.trailing_amount,
          trail_step_type: config.trail_step_type,
          trail_step_value: config.trail_step_value,
          trail_reference: config.trail_reference,
          trail_never_loosen: config.trail_never_loosen,
          max_order_updates_per_minute: config.max_order_updates_per_minute,
          allow_after_hours: config.allow_after_hours,
          slippage_buffer: config.slippage_buffer,
        })
        .eq('id', strategy.id);

      if (error) throw error;

      // Log event
      await supabase.from('phroureo_strategy_events').insert({
        strategy_id: strategy.id,
        event_type: 'MANUAL_EDIT',
        reason: 'Strategy configuration updated by user',
      });

      toast({
        title: "Strategy Updated",
        description: "Your exit strategy has been updated",
      });

      setEditDialogOpen(false);
      onUpdate?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate current P/L
  const currentPL = currentPrice 
    ? (isLong 
        ? (currentPrice - strategy.entry_price) * strategy.quantity * 100
        : (strategy.entry_price - currentPrice) * strategy.quantity * 100)
    : 0;

  return (
    <>
      <Card className="border-primary/20">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              {strategy.strategy_name}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={stateBadge.variant}>
                {stateBadge.label}
              </Badge>
              {!strategy.enabled && (
                <Badge variant="secondary">Paused</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Position Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Symbol</p>
              <div className="flex items-center gap-1">
                <p className="font-medium">{strategy.symbol}</p>
                <Badge variant={isLong ? 'default' : 'destructive'} className="text-xs">
                  {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                </Badge>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground">Entry</p>
              <p className="font-medium">${strategy.entry_price.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Current Stop</p>
              <p className="font-medium">
                {strategy.current_stop_price 
                  ? `$${strategy.current_stop_price.toFixed(2)}` 
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Reference {isLong ? 'High' : 'Low'}</p>
              <p className="font-medium">
                {strategy.reference_price 
                  ? `$${strategy.reference_price.toFixed(2)}` 
                  : '—'}
              </p>
            </div>
          </div>

          {/* Strategy Configuration Summary */}
          <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              <span>
                Trigger at{' '}
                {strategy.profit_trigger_type === 'PRICE_LEVEL' 
                  ? `$${strategy.profit_trigger_value.toFixed(2)}`
                  : `${strategy.profit_trigger_unit === 'DOLLAR' ? '$' : ''}${strategy.profit_trigger_value}${strategy.profit_trigger_unit === 'PERCENT' ? '%' : ''}`}
                {' '}profit
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span>
                Stop set to {STOP_SET_MODE_LABELS[strategy.stop_set_mode]}
                {strategy.stop_set_value && ` (${strategy.stop_set_value})`}
              </span>
            </div>
            {strategy.enable_trailing && (
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <span>
                  Trail by {strategy.trailing_type === 'DOLLAR' ? '$' : ''}{strategy.trailing_amount}{strategy.trailing_type === 'PERCENT' ? '%' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Triggered Info */}
          {strategy.triggered_at && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="w-3 h-3" />
              Triggered {format(new Date(strategy.triggered_at), 'MMM d, h:mm a')}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-2 border-t">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePauseResume}
                disabled={loading}
              >
                {strategy.enabled 
                  ? <><Pause className="w-4 h-4 mr-1" /> Pause</> 
                  : <><Play className="w-4 h-4 mr-1" /> Resume</>}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditDialogOpen(true)}
                disabled={loading}
              >
                <Edit className="w-4 h-4 mr-1" />
                Edit
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={loading}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Audit Log */}
          <PhroureoAuditLog strategyId={strategy.id} />
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Exit Strategy</DialogTitle>
            <DialogDescription>
              Modify your Phroureo exit strategy settings. Changes will apply immediately.
            </DialogDescription>
          </DialogHeader>
          <PhroureoStrategyBuilder
            symbol={strategy.symbol}
            side={strategy.side}
            entryPrice={strategy.entry_price}
            quantity={strategy.quantity}
            currentPrice={currentPrice}
            onSave={handleSaveEdit}
            onCancel={() => setEditDialogOpen(false)}
            initialConfig={{
              strategy_name: strategy.strategy_name,
              profit_trigger_type: strategy.profit_trigger_type,
              profit_trigger_value: strategy.profit_trigger_value,
              profit_trigger_unit: strategy.profit_trigger_unit,
              trigger_once: strategy.trigger_once,
              stop_set_mode: strategy.stop_set_mode,
              stop_set_value: strategy.stop_set_value ?? undefined,
              stop_set_lock: strategy.stop_set_lock,
              stop_set_rounding: strategy.stop_set_rounding,
              enable_trailing: strategy.enable_trailing,
              trailing_type: strategy.trailing_type ?? undefined,
              trailing_amount: strategy.trailing_amount ?? undefined,
              trail_step_type: strategy.trail_step_type ?? undefined,
              trail_step_value: strategy.trail_step_value ?? undefined,
              trail_reference: strategy.trail_reference ?? undefined,
              trail_never_loosen: strategy.trail_never_loosen,
              max_order_updates_per_minute: strategy.max_order_updates_per_minute,
              allow_after_hours: strategy.allow_after_hours,
              slippage_buffer: strategy.slippage_buffer ?? undefined,
            }}
            mode="edit"
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Exit Strategy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this exit strategy? This action cannot be undone.
              Your position will remain open but will no longer have automated stop management.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
