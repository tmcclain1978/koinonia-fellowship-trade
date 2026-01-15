import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Plus, 
  Trash2, 
  GitBranch, 
  AlertTriangle, 
  Target, 
  TrendingDown, 
  Percent,
  DollarSign,
  Clock,
  Edit
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExitCondition {
  id: string;
  type: 'percentage_loss' | 'percentage_gain' | 'price_below' | 'price_above' | 'time_based';
  value: number;
  action: 'close_all' | 'close_half' | 'trail_stop';
  orderType: 'MARKET' | 'LIMIT';
  limitOffset?: number;
}

export interface ExitStrategy {
  enabled: boolean;
  strategyType: 'oco' | 'bracket' | 'custom';
  conditions: ExitCondition[];
}

interface Position {
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  side?: string;
  strike?: number;
  expiration?: string;
}

interface EditableExitStrategyProps {
  position: Position;
  initialStrategy?: ExitStrategy;
  onSave: (strategy: ExitStrategy) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EditableExitStrategy = ({
  position,
  initialStrategy,
  onSave,
  open,
  onOpenChange,
}: EditableExitStrategyProps) => {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(initialStrategy?.enabled ?? true);
  const [strategyType, setStrategyType] = useState<'oco' | 'bracket' | 'custom'>(
    initialStrategy?.strategyType ?? 'oco'
  );
  const [conditions, setConditions] = useState<ExitCondition[]>(
    initialStrategy?.conditions ?? []
  );

  const positionValue = position.entryPrice * position.quantity * 100; // For options

  // Quick presets
  const applyPreset = (preset: 'conservative' | 'aggressive' | 'balanced') => {
    let newConditions: ExitCondition[] = [];

    switch (preset) {
      case 'conservative':
        newConditions = [
          { id: '1', type: 'percentage_loss', value: 20, action: 'close_all', orderType: 'MARKET' },
          { id: '2', type: 'percentage_gain', value: 30, action: 'close_all', orderType: 'LIMIT', limitOffset: 0.05 },
        ];
        break;
      case 'aggressive':
        newConditions = [
          { id: '1', type: 'percentage_loss', value: 50, action: 'close_all', orderType: 'MARKET' },
          { id: '2', type: 'percentage_gain', value: 100, action: 'close_half', orderType: 'LIMIT', limitOffset: 0.10 },
          { id: '3', type: 'percentage_gain', value: 200, action: 'close_all', orderType: 'LIMIT', limitOffset: 0.10 },
        ];
        break;
      case 'balanced':
        newConditions = [
          { id: '1', type: 'percentage_loss', value: 30, action: 'close_all', orderType: 'MARKET' },
          { id: '2', type: 'percentage_gain', value: 50, action: 'close_half', orderType: 'LIMIT', limitOffset: 0.05 },
          { id: '3', type: 'percentage_gain', value: 100, action: 'close_all', orderType: 'LIMIT', limitOffset: 0.05 },
        ];
        break;
    }

    setConditions(newConditions);
    setEnabled(true);
    setStrategyType('custom');
  };

  const addCondition = () => {
    const newCondition: ExitCondition = {
      id: crypto.randomUUID(),
      type: 'percentage_loss',
      value: 20,
      action: 'close_all',
      orderType: 'MARKET',
    };
    setConditions([...conditions, newCondition]);
  };

  const removeCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  const updateCondition = (id: string, updates: Partial<ExitCondition>) => {
    setConditions(conditions.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const calculateExitPrice = (condition: ExitCondition) => {
    const baseValue = positionValue;
    
    switch (condition.type) {
      case 'percentage_loss':
        return baseValue * (1 - condition.value / 100);
      case 'percentage_gain':
        return baseValue * (1 + condition.value / 100);
      case 'price_below':
      case 'price_above':
        return condition.value;
      default:
        return baseValue;
    }
  };

  const getConditionIcon = (type: ExitCondition['type']) => {
    switch (type) {
      case 'percentage_loss':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'percentage_gain':
        return <Target className="h-4 w-4 text-green-500" />;
      case 'price_below':
        return <DollarSign className="h-4 w-4 text-red-500" />;
      case 'price_above':
        return <DollarSign className="h-4 w-4 text-green-500" />;
      case 'time_based':
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getConditionDescription = (condition: ExitCondition) => {
    const exitValue = calculateExitPrice(condition);
    
    switch (condition.type) {
      case 'percentage_loss':
        return `If position loses ${condition.value}% (≈$${exitValue.toFixed(2)})`;
      case 'percentage_gain':
        return `If position gains ${condition.value}% (≈$${exitValue.toFixed(2)})`;
      case 'price_below':
        return `If price falls below $${condition.value.toFixed(2)}`;
      case 'price_above':
        return `If price rises above $${condition.value.toFixed(2)}`;
      case 'time_based':
        return `After ${condition.value} days`;
      default:
        return 'Unknown condition';
    }
  };

  const handleSave = () => {
    const strategy: ExitStrategy = {
      enabled,
      strategyType,
      conditions,
    };
    onSave(strategy);
    toast({
      title: "Exit Strategy Updated",
      description: `Exit strategy for ${position.symbol} has been saved.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Edit Exit Strategy - {position.symbol}
          </DialogTitle>
          <DialogDescription>
            Configure automatic exit conditions for this position
          </DialogDescription>
        </DialogHeader>

        {/* Position Summary */}
        <div className="bg-muted/50 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold">{position.symbol}</span>
            {position.side && (
              <Badge variant={position.side === 'CALL' ? 'default' : 'destructive'}>
                {position.side}
              </Badge>
            )}
          </div>
          {position.strike && (
            <p className="text-sm text-muted-foreground">
              ${position.strike} Strike • {position.expiration}
            </p>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Quantity:</span>
            <span>{position.quantity}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Entry Price:</span>
            <span>${position.entryPrice.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Current Price:</span>
            <span>${position.currentPrice.toFixed(2)}</span>
          </div>
        </div>

        {/* Enable Toggle */}
        <div className="flex items-center justify-between">
          <Label htmlFor="exit-enabled">Enable Exit Strategy</Label>
          <Switch id="exit-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {enabled && (
          <div className="space-y-4">
            {/* Quick Presets */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quick Presets</Label>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => applyPreset('conservative')}>
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Conservative
                </Button>
                <Button variant="outline" size="sm" onClick={() => applyPreset('balanced')}>
                  <Target className="h-3 w-3 mr-1" />
                  Balanced
                </Button>
                <Button variant="outline" size="sm" onClick={() => applyPreset('aggressive')}>
                  <Percent className="h-3 w-3 mr-1" />
                  Aggressive
                </Button>
              </div>
            </div>

            <Separator />

            {/* Strategy Type */}
            <div className="space-y-2">
              <Label>Order Strategy</Label>
              <Select value={strategyType} onValueChange={(v) => setStrategyType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oco">OCO (One-Cancels-Other)</SelectItem>
                  <SelectItem value="bracket">Bracket Order</SelectItem>
                  <SelectItem value="custom">Custom If-Then</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Exit Conditions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Exit Conditions</Label>
                <Button variant="ghost" size="sm" onClick={addCondition}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>

              {conditions.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm border rounded-lg border-dashed">
                  No exit conditions. Add one or use a preset.
                </div>
              )}

              {conditions.map((condition, index) => (
                <div key={condition.id} className="p-3 border rounded-lg space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getConditionIcon(condition.type)}
                      <Badge variant="outline" className="text-xs">
                        {index === 0 ? 'IF' : 'OR IF'}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeCondition(condition.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Select 
                      value={condition.type} 
                      onValueChange={(v) => updateCondition(condition.id, { type: v as any })}
                    >
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage_loss">% Loss</SelectItem>
                        <SelectItem value="percentage_gain">% Gain</SelectItem>
                        <SelectItem value="price_below">Price Below</SelectItem>
                        <SelectItem value="price_above">Price Above</SelectItem>
                        <SelectItem value="time_based">Days Held</SelectItem>
                      </SelectContent>
                    </Select>

                    <Input
                      type="number"
                      value={condition.value}
                      onChange={(e) => updateCondition(condition.id, { value: parseFloat(e.target.value) || 0 })}
                      className="text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Select 
                      value={condition.action} 
                      onValueChange={(v) => updateCondition(condition.id, { action: v as any })}
                    >
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="close_all">Close All</SelectItem>
                        <SelectItem value="close_half">Close Half</SelectItem>
                        <SelectItem value="trail_stop">Trail Stop</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select 
                      value={condition.orderType} 
                      onValueChange={(v) => updateCondition(condition.id, { orderType: v as any })}
                    >
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MARKET">Market</SelectItem>
                        <SelectItem value="LIMIT">Limit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                    {getConditionDescription(condition)} → {condition.action.replace('_', ' ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Strategy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Button component for opening the dialog from OpenPositions
export const EditExitStrategyButton = ({
  position,
  onSave,
}: {
  position: Position;
  onSave: (strategy: ExitStrategy) => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="shrink-0"
      >
        <Edit className="w-4 h-4 mr-1" />
        Exit
      </Button>
      <EditableExitStrategy
        position={position}
        open={open}
        onOpenChange={setOpen}
        onSave={onSave}
      />
    </>
  );
};
