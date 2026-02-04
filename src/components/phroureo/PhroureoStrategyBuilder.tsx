import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Shield, 
  Target, 
  TrendingUp, 
  Settings, 
  ChevronDown,
  Info,
  Sparkles
} from "lucide-react";
import { 
  PhroureoStrategyInput,
  ProfitTriggerType,
  ProfitTriggerUnit,
  StopSetMode,
  TrailingType,
  TrailStepType,
  TrailReference,
  StopSetRounding,
  PositionSide,
  STOP_SET_MODE_LABELS,
} from "./phroureoTypes";
import { PHROUREO_PRESETS, getPresetById } from "./phroureoPresets";
import { PhroureoPreview } from "./PhroureoPreview";

interface PhroureoStrategyBuilderProps {
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  quantity: number;
  currentPrice?: number;
  onSave: (config: PhroureoStrategyInput) => void;
  onCancel?: () => void;
  initialConfig?: Partial<PhroureoStrategyInput>;
  mode?: 'create' | 'edit';
}

export function PhroureoStrategyBuilder({
  symbol,
  side,
  entryPrice,
  quantity,
  currentPrice,
  onSave,
  onCancel,
  initialConfig,
  mode = 'create',
}: PhroureoStrategyBuilderProps) {
  // Trigger settings
  const [profitTriggerType, setProfitTriggerType] = useState<ProfitTriggerType>(
    initialConfig?.profit_trigger_type ?? 'UNREALIZED_PL'
  );
  const [profitTriggerValue, setProfitTriggerValue] = useState<number>(
    initialConfig?.profit_trigger_value ?? 50
  );
  const [profitTriggerUnit, setProfitTriggerUnit] = useState<ProfitTriggerUnit>(
    initialConfig?.profit_trigger_unit ?? 'DOLLAR'
  );
  const [triggerOnce, setTriggerOnce] = useState(initialConfig?.trigger_once ?? true);

  // Stop set settings
  const [stopSetMode, setStopSetMode] = useState<StopSetMode>(
    initialConfig?.stop_set_mode ?? 'BREAKEVEN'
  );
  const [stopSetValue, setStopSetValue] = useState<number | undefined>(
    initialConfig?.stop_set_value ?? undefined
  );
  const [stopSetLock, setStopSetLock] = useState(initialConfig?.stop_set_lock ?? true);
  const [stopSetRounding, setStopSetRounding] = useState<StopSetRounding>(
    initialConfig?.stop_set_rounding ?? 'TICK_SIZE'
  );

  // Trailing settings
  const [enableTrailing, setEnableTrailing] = useState(initialConfig?.enable_trailing ?? false);
  const [trailingType, setTrailingType] = useState<TrailingType>(
    initialConfig?.trailing_type ?? 'DOLLAR'
  );
  const [trailingAmount, setTrailingAmount] = useState<number | undefined>(
    initialConfig?.trailing_amount ?? 0.25
  );
  const [trailStepType, setTrailStepType] = useState<TrailStepType>(
    initialConfig?.trail_step_type ?? 'DOLLAR_STEP'
  );
  const [trailStepValue, setTrailStepValue] = useState<number | undefined>(
    initialConfig?.trail_step_value ?? 0.10
  );
  const [trailReference, setTrailReference] = useState<TrailReference>(
    initialConfig?.trail_reference ?? 'HIGHEST_SINCE_TRIGGER'
  );
  const [trailNeverLoosen, setTrailNeverLoosen] = useState(initialConfig?.trail_never_loosen ?? true);

  // Safety settings
  const [maxOrderUpdates, setMaxOrderUpdates] = useState(
    initialConfig?.max_order_updates_per_minute ?? 10
  );
  const [allowAfterHours, setAllowAfterHours] = useState(
    initialConfig?.allow_after_hours ?? false
  );
  const [slippageBuffer, setSlippageBuffer] = useState<number | undefined>(
    initialConfig?.slippage_buffer ?? undefined
  );

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [strategyName, setStrategyName] = useState(
    initialConfig?.strategy_name ?? 'Phroureo Protection'
  );

  // Apply preset
  const applyPreset = (presetId: string) => {
    const preset = getPresetById(presetId);
    if (!preset) return;

    const c = preset.config;
    if (c.profit_trigger_type) setProfitTriggerType(c.profit_trigger_type);
    if (c.profit_trigger_value !== undefined) setProfitTriggerValue(c.profit_trigger_value);
    if (c.profit_trigger_unit) setProfitTriggerUnit(c.profit_trigger_unit);
    if (c.trigger_once !== undefined) setTriggerOnce(c.trigger_once);
    if (c.stop_set_mode) setStopSetMode(c.stop_set_mode);
    if (c.stop_set_value !== undefined) setStopSetValue(c.stop_set_value);
    if (c.stop_set_lock !== undefined) setStopSetLock(c.stop_set_lock);
    if (c.enable_trailing !== undefined) setEnableTrailing(c.enable_trailing);
    if (c.trailing_type) setTrailingType(c.trailing_type);
    if (c.trailing_amount !== undefined) setTrailingAmount(c.trailing_amount);
    if (c.trail_step_type) setTrailStepType(c.trail_step_type);
    if (c.trail_step_value !== undefined) setTrailStepValue(c.trail_step_value);
    if (c.trail_reference) setTrailReference(c.trail_reference);
    if (c.trail_never_loosen !== undefined) setTrailNeverLoosen(c.trail_never_loosen);
    setStrategyName(preset.name);
  };

  const buildConfig = (): PhroureoStrategyInput => ({
    strategy_name: strategyName,
    symbol,
    side,
    entry_price: entryPrice,
    quantity,
    profit_trigger_type: profitTriggerType,
    profit_trigger_value: profitTriggerValue,
    profit_trigger_unit: profitTriggerUnit,
    trigger_once: triggerOnce,
    stop_set_mode: stopSetMode,
    stop_set_value: stopSetValue ?? null,
    stop_set_lock: stopSetLock,
    stop_set_rounding: stopSetRounding,
    enable_trailing: enableTrailing,
    trailing_type: trailingType,
    trailing_amount: trailingAmount,
    trail_step_type: trailStepType,
    trail_step_value: trailStepValue,
    trail_reference: trailReference,
    trail_never_loosen: trailNeverLoosen,
    max_order_updates_per_minute: maxOrderUpdates,
    allow_after_hours: allowAfterHours,
    slippage_buffer: slippageBuffer,
  });

  const handleSave = () => {
    onSave(buildConfig());
  };

  const needsStopSetValue = ['BREAKEVEN_PLUS', 'FIXED_PRICE', 'PERCENT_FROM_ENTRY', 'PERCENT_FROM_CURRENT', 'DOLLAR_FROM_ENTRY', 'ATR_MULTIPLE'].includes(stopSetMode);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Strategy Name */}
        <div className="space-y-2">
          <Label>Strategy Name</Label>
          <Input
            value={strategyName}
            onChange={(e) => setStrategyName(e.target.value)}
            placeholder="My Exit Strategy"
          />
        </div>

        {/* Presets */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Quick Presets
          </Label>
          <div className="flex flex-wrap gap-2">
            {PHROUREO_PRESETS.map((preset) => (
              <Tooltip key={preset.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset(preset.id)}
                  >
                    {preset.name}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{preset.description}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Configuration Panel */}
          <div className="space-y-4">
            {/* Profit Trigger Section */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Profit Trigger
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Trigger Type</Label>
                  <Select value={profitTriggerType} onValueChange={(v) => setProfitTriggerType(v as ProfitTriggerType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNREALIZED_PL">Unrealized P/L</SelectItem>
                      <SelectItem value="REALIZED_PL">Realized P/L</SelectItem>
                      <SelectItem value="PRICE_LEVEL">Price Level</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>
                      {profitTriggerType === 'PRICE_LEVEL' ? 'Target Price' : 'Profit Amount'}
                    </Label>
                    <Input
                      type="number"
                      value={profitTriggerValue}
                      onChange={(e) => setProfitTriggerValue(parseFloat(e.target.value) || 0)}
                      step={profitTriggerUnit === 'PERCENT' ? 0.1 : 1}
                    />
                  </div>
                  {profitTriggerType !== 'PRICE_LEVEL' && (
                    <div className="space-y-2">
                      <Label>Unit</Label>
                      <Select value={profitTriggerUnit} onValueChange={(v) => setProfitTriggerUnit(v as ProfitTriggerUnit)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DOLLAR">Dollar ($)</SelectItem>
                          <SelectItem value="PERCENT">Percent (%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="trigger-once">Trigger Once</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-3 h-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>When enabled, strategy activates only once.<br />Disable for multi-trigger mode.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Switch
                    id="trigger-once"
                    checked={triggerOnce}
                    onCheckedChange={setTriggerOnce}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Stop Set Section */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Stop Set on Trigger
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Stop Mode</Label>
                  <Select value={stopSetMode} onValueChange={(v) => setStopSetMode(v as StopSetMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STOP_SET_MODE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {needsStopSetValue && (
                  <div className="space-y-2">
                    <Label>
                      {stopSetMode === 'FIXED_PRICE' && 'Stop Price'}
                      {stopSetMode === 'BREAKEVEN_PLUS' && 'Amount Above Break-Even ($)'}
                      {stopSetMode === 'PERCENT_FROM_ENTRY' && 'Percent (%)'}
                      {stopSetMode === 'PERCENT_FROM_CURRENT' && 'Percent (%)'}
                      {stopSetMode === 'DOLLAR_FROM_ENTRY' && 'Dollar Amount ($)'}
                      {stopSetMode === 'ATR_MULTIPLE' && 'ATR Multiplier'}
                    </Label>
                    <Input
                      type="number"
                      value={stopSetValue ?? ''}
                      onChange={(e) => setStopSetValue(parseFloat(e.target.value) || undefined)}
                      step={stopSetMode.includes('PERCENT') ? 0.1 : 0.01}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="stop-lock">Never Loosen Stop</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-3 h-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Once stop is set, it can only move in your favor</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Switch
                    id="stop-lock"
                    checked={stopSetLock}
                    onCheckedChange={setStopSetLock}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Trailing Stop Section */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Trailing Stop
                  <Switch
                    checked={enableTrailing}
                    onCheckedChange={setEnableTrailing}
                  />
                </CardTitle>
              </CardHeader>
              {enableTrailing && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label>Trail Type</Label>
                      <Select value={trailingType} onValueChange={(v) => setTrailingType(v as TrailingType)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DOLLAR">Dollar ($)</SelectItem>
                          <SelectItem value="PERCENT">Percent (%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Trail Amount</Label>
                      <Input
                        type="number"
                        value={trailingAmount ?? ''}
                        onChange={(e) => setTrailingAmount(parseFloat(e.target.value) || undefined)}
                        step={trailingType === 'PERCENT' ? 0.1 : 0.01}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label>Update Step Type</Label>
                      <Select value={trailStepType} onValueChange={(v) => setTrailStepType(v as TrailStepType)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DOLLAR_STEP">Dollar ($)</SelectItem>
                          <SelectItem value="PERCENT_STEP">Percent (%)</SelectItem>
                          <SelectItem value="TICK_STEP">Ticks</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Step Value</Label>
                      <Input
                        type="number"
                        value={trailStepValue ?? ''}
                        onChange={(e) => setTrailStepValue(parseFloat(e.target.value) || undefined)}
                        step={0.01}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Reference Point</Label>
                    <Select value={trailReference} onValueChange={(v) => setTrailReference(v as TrailReference)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HIGHEST_SINCE_TRIGGER">
                          {side === 'long' ? 'Highest' : 'Lowest'} Since Trigger
                        </SelectItem>
                        <SelectItem value="HIGHEST_SINCE_ENTRY">
                          {side === 'long' ? 'Highest' : 'Lowest'} Since Entry
                        </SelectItem>
                        <SelectItem value="CURRENT_PRICE">Current Price</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="trail-lock">Never Loosen Trail</Label>
                    <Switch
                      id="trail-lock"
                      checked={trailNeverLoosen}
                      onCheckedChange={setTrailNeverLoosen}
                    />
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Advanced Settings */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="py-3 cursor-pointer">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        Safety & Advanced
                      </span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Max Order Updates/Minute</Label>
                      <Input
                        type="number"
                        value={maxOrderUpdates}
                        onChange={(e) => setMaxOrderUpdates(parseInt(e.target.value) || 10)}
                        min={1}
                        max={60}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Stop Rounding</Label>
                      <Select value={stopSetRounding} onValueChange={(v) => setStopSetRounding(v as StopSetRounding)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TICK_SIZE">Tick Size</SelectItem>
                          <SelectItem value="CENT">Cent ($0.01)</SelectItem>
                          <SelectItem value="NONE">No Rounding</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Slippage Buffer ($)</Label>
                      <Input
                        type="number"
                        value={slippageBuffer ?? ''}
                        onChange={(e) => setSlippageBuffer(parseFloat(e.target.value) || undefined)}
                        step={0.01}
                        placeholder="Optional"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="after-hours">Allow After Hours</Label>
                      <Switch
                        id="after-hours"
                        checked={allowAfterHours}
                        onCheckedChange={setAllowAfterHours}
                      />
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>

          {/* Preview Panel */}
          <div className="lg:sticky lg:top-4 space-y-4">
            <PhroureoPreview config={buildConfig()} currentPrice={currentPrice} />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSave}>
            <Shield className="w-4 h-4 mr-2" />
            {mode === 'edit' ? 'Update Strategy' : 'Save Strategy'}
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
