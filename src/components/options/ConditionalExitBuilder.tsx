import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Save,
  Loader2,
  HelpCircle
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useExitPreferences, ExitConditionPreset, SavedPreset } from "@/hooks/useExitPreferences";

interface ExitCondition {
  id: string;
  type: 'percentage_loss' | 'percentage_gain' | 'price_below' | 'price_above' | 'time_based';
  value: number;
  action: 'close_all' | 'close_half' | 'trail_stop';
  orderType: 'MARKET' | 'LIMIT';
  limitOffset?: number;
}

interface ExitStrategy {
  enabled: boolean;
  strategyType: 'oco' | 'bracket' | 'custom';
  conditions: ExitCondition[];
}

interface ConditionalExitBuilderProps {
  onStrategyChange?: (strategy: ExitStrategy) => void;
  positionValue?: number;
}

export const ConditionalExitBuilder = ({
  onStrategyChange,
  positionValue = 1000,
}: ConditionalExitBuilderProps) => {
  const { 
    preferences, 
    loading: prefsLoading, 
    saving, 
    savePreferences, 
    savePreset, 
    deletePreset 
  } = useExitPreferences();
  
  const [enabled, setEnabled] = useState(false);
  const [strategyType, setStrategyType] = useState<'oco' | 'bracket' | 'custom'>('oco');
  const [conditions, setConditions] = useState<ExitCondition[]>([]);
  
  // Stop loss settings
  const [stopLossEnabled, setStopLossEnabled] = useState(false);
  const [stopLossType, setStopLossType] = useState<'PERCENT' | 'DOLLAR'>('PERCENT');
  const [stopLossValue, setStopLossValue] = useState(20);
  
  // Trailing stop settings
  const [trailingEnabled, setTrailingEnabled] = useState(false);
  const [trailingType, setTrailingType] = useState<'PERCENT' | 'DOLLAR'>('PERCENT');
  const [trailingValue, setTrailingValue] = useState(10);
  
  // New preset name input
  const [newPresetName, setNewPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    if (preferences) {
      setStopLossEnabled(preferences.default_stop_loss_enabled);
      setStopLossType(preferences.default_stop_loss_type);
      setStopLossValue(preferences.default_stop_loss_value);
      setTrailingEnabled(preferences.default_trailing_enabled);
      setTrailingType(preferences.default_trailing_type);
      setTrailingValue(preferences.default_trailing_value);
    }
  }, [preferences]);

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
    notifyChange(true, 'custom', newConditions);
  };

  // Apply saved preset
  const applySavedPreset = (preset: SavedPreset) => {
    const newConditions = preset.conditions.map(c => ({
      ...c,
      id: crypto.randomUUID(),
    }));
    setConditions(newConditions);
    setEnabled(true);
    setStrategyType('custom');
    notifyChange(true, 'custom', newConditions);
  };

  // Add a new condition
  const addCondition = () => {
    const newCondition: ExitCondition = {
      id: crypto.randomUUID(),
      type: 'percentage_loss',
      value: 20,
      action: 'close_all',
      orderType: 'MARKET',
    };
    const updated = [...conditions, newCondition];
    setConditions(updated);
    notifyChange(enabled, strategyType, updated);
  };

  // Remove a condition
  const removeCondition = (id: string) => {
    const updated = conditions.filter(c => c.id !== id);
    setConditions(updated);
    notifyChange(enabled, strategyType, updated);
  };

  // Update a condition
  const updateCondition = (id: string, updates: Partial<ExitCondition>) => {
    const updated = conditions.map(c => c.id === id ? { ...c, ...updates } : c);
    setConditions(updated);
    notifyChange(enabled, strategyType, updated);
  };

  // Toggle enabled
  const toggleEnabled = (value: boolean) => {
    setEnabled(value);
    notifyChange(value, strategyType, conditions);
  };

  // Notify parent of changes
  const notifyChange = (en: boolean, st: 'oco' | 'bracket' | 'custom', conds: ExitCondition[]) => {
    onStrategyChange?.({
      enabled: en,
      strategyType: st,
      conditions: conds,
    });
  };

  // Save current settings as default
  const saveAsDefault = async () => {
    await savePreferences({
      default_stop_loss_enabled: stopLossEnabled,
      default_stop_loss_type: stopLossType,
      default_stop_loss_value: stopLossValue,
      default_trailing_enabled: trailingEnabled,
      default_trailing_type: trailingType,
      default_trailing_value: trailingValue,
    });
  };

  // Save current conditions as a new preset
  const handleSavePreset = async () => {
    if (!newPresetName.trim()) return;
    
    const conditionsToSave: ExitConditionPreset[] = conditions.map(c => ({
      id: c.id,
      type: c.type,
      value: c.value,
      action: c.action,
      orderType: c.orderType,
      limitOffset: c.limitOffset,
    }));
    
    const success = await savePreset(newPresetName.trim(), conditionsToSave);
    if (success) {
      setNewPresetName('');
      setShowSavePreset(false);
    }
  };

  // Calculate exit prices based on conditions
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

  // Get icon for condition type
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

  // Get readable description for condition
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

  if (prefsLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Conditional Exit Strategy
          </CardTitle>
          <Switch checked={enabled} onCheckedChange={toggleEnabled} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            Enable to set up automatic exit conditions (If-Then orders)
          </div>
        )}

        {enabled && (
          <>
            {/* Default Stop Loss & Trailing Settings */}
            <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Default Protection Settings</Label>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={saveAsDefault}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                  Save as Default
                </Button>
              </div>
              
              {/* Stop Loss */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    Stop Loss
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-sm">
                            <strong>Activates protection when your profit reaches this threshold.</strong>
                            <br /><br />
                            • <strong>Dollar:</strong> When you're up $X in profit (e.g., $50 = activate when profit hits $50)
                            <br />
                            • <strong>Percent:</strong> When your position is up X% (e.g., 10% = activate when position gains 10%)
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                  <Switch 
                    checked={stopLossEnabled} 
                    onCheckedChange={setStopLossEnabled} 
                  />
                </div>
                
                {stopLossEnabled && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Type</Label>
                      <RadioGroup 
                        value={stopLossType} 
                        onValueChange={(v) => setStopLossType(v as 'PERCENT' | 'DOLLAR')}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="PERCENT" id="sl-percent" />
                          <Label htmlFor="sl-percent" className="text-sm flex items-center gap-1">
                            <Percent className="h-3 w-3" /> Percent
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="DOLLAR" id="sl-dollar" />
                          <Label htmlFor="sl-dollar" className="text-sm flex items-center gap-1">
                            <DollarSign className="h-3 w-3" /> Dollar
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                        {stopLossType === 'DOLLAR' ? 'Profit Trigger ($)' : 'Profit Trigger (%)'}
                      </Label>
                      <div className="relative">
                        <Input
                          type="number"
                          value={stopLossValue}
                          onChange={(e) => setStopLossValue(parseFloat(e.target.value) || 0)}
                          className="pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          {stopLossType === 'PERCENT' ? '%' : '$'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {stopLossType === 'DOLLAR' 
                          ? `Activate when profit reaches $${stopLossValue}` 
                          : `Activate when position is up ${stopLossValue}%`}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Trailing Stop */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm flex items-center gap-2">
                    <Target className="h-4 w-4 text-green-500" />
                    Trailing Stop
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-sm">
                            <strong>How far back the trailing stop follows from the highest profit.</strong>
                            <br /><br />
                            • <strong>Dollar:</strong> Trail $X behind peak (e.g., $20 = stop trails $20 behind highest profit)
                            <br />
                            • <strong>Percent:</strong> Trail X% behind peak (e.g., 5% = stop trails 5% behind peak)
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </Label>
                  <Switch 
                    checked={trailingEnabled} 
                    onCheckedChange={setTrailingEnabled} 
                  />
                </div>
                
                {trailingEnabled && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Type</Label>
                      <RadioGroup 
                        value={trailingType} 
                        onValueChange={(v) => setTrailingType(v as 'PERCENT' | 'DOLLAR')}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="PERCENT" id="ts-percent" />
                          <Label htmlFor="ts-percent" className="text-sm flex items-center gap-1">
                            <Percent className="h-3 w-3" /> Percent
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="DOLLAR" id="ts-dollar" />
                          <Label htmlFor="ts-dollar" className="text-sm flex items-center gap-1">
                            <DollarSign className="h-3 w-3" /> Dollar
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">
                       {trailingType === 'DOLLAR' ? 'Profit Trail Distance ($)' : 'Profit Trail Distance (%)'}
                      </Label>
                      <div className="relative">
                        <Input
                          type="number"
                          value={trailingValue}
                          onChange={(e) => setTrailingValue(parseFloat(e.target.value) || 0)}
                          className="pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          {trailingType === 'PERCENT' ? '%' : '$'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {trailingType === 'DOLLAR' 
                          ? `Stop trails $${trailingValue} behind peak profit` 
                         : `Stop trails ${trailingValue}% behind peak profit`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator />

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

            {/* Saved Presets */}
            {preferences && preferences.saved_exit_presets.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">My Saved Presets</Label>
                <div className="space-y-2">
                  {preferences.saved_exit_presets.map((preset) => (
                    <div 
                      key={preset.id} 
                      className="flex items-center justify-between p-2 border rounded bg-muted/30"
                    >
                      <span className="text-sm font-medium">{preset.name}</span>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => applySavedPreset(preset)}
                        >
                          Apply
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => deletePreset(preset.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Strategy Type */}
            <div className="space-y-2">
              <Label>Order Strategy</Label>
              <Select value={strategyType} onValueChange={(v) => {
                setStrategyType(v as 'oco' | 'bracket' | 'custom');
                notifyChange(enabled, v as 'oco' | 'bracket' | 'custom', conditions);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oco">OCO (One-Cancels-Other)</SelectItem>
                  <SelectItem value="bracket">Bracket Order</SelectItem>
                  <SelectItem value="custom">Custom If-Then</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {strategyType === 'oco' && 'First triggered exit cancels the others'}
                {strategyType === 'bracket' && 'Entry triggers both profit target and stop loss'}
                {strategyType === 'custom' && 'Define your own exit conditions'}
              </p>
            </div>

            {/* Exit Conditions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Exit Conditions</Label>
                <div className="flex gap-2">
                  {conditions.length > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setShowSavePreset(!showSavePreset)}
                    >
                      <Save className="h-4 w-4 mr-1" /> Save Preset
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={addCondition}>
                    <Plus className="h-4 w-4 mr-1" /> Add Condition
                  </Button>
                </div>
              </div>

              {/* Save Preset Input */}
              {showSavePreset && (
                <div className="flex gap-2 p-2 border rounded bg-muted/30">
                  <Input
                    placeholder="Preset name..."
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleSavePreset} disabled={!newPresetName.trim() || saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowSavePreset(false)}>
                    Cancel
                  </Button>
                </div>
              )}

              {conditions.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm border rounded-lg border-dashed">
                  No exit conditions defined. Add one or use a preset.
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
                      onValueChange={(v) => updateCondition(condition.id, { type: v as ExitCondition['type'] })}
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
                      placeholder={condition.type.includes('percentage') ? '20%' : '$100'}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Select 
                      value={condition.action} 
                      onValueChange={(v) => updateCondition(condition.id, { action: v as ExitCondition['action'] })}
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
                      onValueChange={(v) => updateCondition(condition.id, { orderType: v as 'MARKET' | 'LIMIT' })}
                    >
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MARKET">Market Order</SelectItem>
                        <SelectItem value="LIMIT">Limit Order</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                    {getConditionDescription(condition)} → {condition.action.replace('_', ' ')} with {condition.orderType.toLowerCase()} order
                  </div>
                </div>
              ))}
            </div>

            {/* Strategy Preview */}
            {conditions.length > 0 && (
              <div className="p-4 border rounded-lg bg-primary/5 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <GitBranch className="h-4 w-4" />
                  Strategy Preview
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Type:</strong> {strategyType.toUpperCase()}</p>
                  <p><strong>Conditions:</strong> {conditions.length} exit rule(s)</p>
                  {conditions.map((c, i) => (
                    <p key={c.id} className="pl-2">
                      {i + 1}. {getConditionDescription(c)}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Info */}
            <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-500">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Exit orders will be attached to your main order and submitted together as a linked order strategy.
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
