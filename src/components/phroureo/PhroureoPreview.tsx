import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, TrendingUp, TrendingDown, Shield, Target } from "lucide-react";
import {
  PhroureoStrategyInput,
  PositionSide,
  STOP_SET_MODE_LABELS,
  calculateStopPrice,
} from "./phroureoTypes";

interface PhroureoPreviewProps {
  config: Partial<PhroureoStrategyInput>;
  currentPrice?: number;
}

export function PhroureoPreview({ config, currentPrice }: PhroureoPreviewProps) {
  const {
    symbol = 'SYMBOL',
    side = 'long',
    entry_price = 100,
    quantity = 1,
    profit_trigger_type = 'UNREALIZED_PL',
    profit_trigger_value = 50,
    profit_trigger_unit = 'DOLLAR',
    stop_set_mode = 'BREAKEVEN',
    stop_set_value,
    enable_trailing = false,
    trailing_type = 'DOLLAR',
    trailing_amount = 0.25,
    trail_step_value = 0.10,
    trail_step_type = 'DOLLAR_STEP',
  } = config;

  const isLong = side === 'long';
  const price = currentPrice ?? entry_price;
  
  // Calculate example trigger price
  let triggerDescription = '';
  let triggerPrice = 0;
  
  if (profit_trigger_type === 'PRICE_LEVEL') {
    triggerPrice = profit_trigger_value;
    triggerDescription = `price ${isLong ? 'reaches' : 'drops to'} $${triggerPrice.toFixed(2)}`;
  } else {
    if (profit_trigger_unit === 'DOLLAR') {
      const profitPerContract = profit_trigger_value / (quantity * 100);
      triggerPrice = isLong 
        ? entry_price + profitPerContract 
        : entry_price - profitPerContract;
      triggerDescription = `+$${profit_trigger_value.toFixed(2)} profit`;
    } else {
      const pctMove = profit_trigger_value / 100;
      triggerPrice = isLong 
        ? entry_price * (1 + pctMove) 
        : entry_price * (1 - pctMove);
      triggerDescription = `+${profit_trigger_value}% profit`;
    }
  }

  // Calculate stop price
  const stopPrice = calculateStopPrice(
    stop_set_mode,
    entry_price,
    price,
    side,
    stop_set_value ?? null
  );

  // Format stop description
  let stopDescription = STOP_SET_MODE_LABELS[stop_set_mode];
  if (stop_set_mode === 'BREAKEVEN_PLUS' && stop_set_value) {
    stopDescription = `Break-even + $${stop_set_value.toFixed(2)}`;
  } else if (stop_set_mode === 'FIXED_PRICE' && stop_set_value) {
    stopDescription = `Fixed at $${stop_set_value.toFixed(2)}`;
  } else if (stop_set_mode === 'PERCENT_FROM_ENTRY' && stop_set_value) {
    stopDescription = `${stop_set_value}% ${isLong ? 'below' : 'above'} entry`;
  } else if (stop_set_mode === 'DOLLAR_FROM_ENTRY' && stop_set_value) {
    stopDescription = `$${stop_set_value.toFixed(2)} ${isLong ? 'below' : 'above'} entry`;
  } else if (stop_set_mode === 'ATR_MULTIPLE' && stop_set_value) {
    stopDescription = `${stop_set_value}x ATR`;
  }

  // Format trailing description
  let trailingDescription = '';
  if (enable_trailing && trailing_amount) {
    const trailUnit = trailing_type === 'DOLLAR' ? `$${trailing_amount.toFixed(2)}` : `${trailing_amount}%`;
    let stepDesc = '';
    if (trail_step_value) {
      if (trail_step_type === 'DOLLAR_STEP') {
        stepDesc = ` every $${trail_step_value.toFixed(2)} move`;
      } else if (trail_step_type === 'PERCENT_STEP') {
        stepDesc = ` every ${trail_step_value}% move`;
      } else {
        stepDesc = ` every ${trail_step_value} ticks`;
      }
    }
    trailingDescription = `Trail by ${trailUnit}${stepDesc}`;
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Strategy Preview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* Position Info */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Position:</span>
          <div className="flex items-center gap-2">
            <span className="font-medium">{symbol}</span>
            <Badge variant={isLong ? 'default' : 'destructive'}>
              {isLong ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {isLong ? 'Long' : 'Short'}
            </Badge>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Entry Price:</span>
          <span className="font-medium">${entry_price.toFixed(2)}</span>
        </div>

        {/* Step 1: Trigger */}
        <div className="bg-accent/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Target className="w-3 h-3" />
            STEP 1: TRIGGER
          </div>
          <p className="font-medium">
            When {triggerDescription}...
          </p>
          <p className="text-muted-foreground text-xs">
            (Price ≈ ${triggerPrice.toFixed(2)})
          </p>
        </div>

        {/* Step 2: Stop Set */}
        <div className="bg-accent/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Shield className="w-3 h-3" />
            STEP 2: STOP SET
          </div>
          <p className="font-medium">
            Stop moves to {stopDescription}
          </p>
          <p className="text-muted-foreground text-xs">
            (Stop ≈ ${stopPrice.toFixed(2)})
          </p>
        </div>

        {/* Step 3: Trailing (if enabled) */}
        {enable_trailing && (
          <div className="bg-accent/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              STEP 3: TRAILING STOP
            </div>
            <p className="font-medium">
              {trailingDescription}
            </p>
            <p className="text-muted-foreground text-xs">
              Stop follows {isLong ? 'highest' : 'lowest'} price, never loosens
            </p>
          </div>
        )}

        {/* Summary */}
        <div className="border-t pt-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              {enable_trailing 
                ? `At ${triggerDescription}, stop moves to $${stopPrice.toFixed(2)} then trails ${isLong ? 'up' : 'down'} as price moves favorably.`
                : `At ${triggerDescription}, stop moves to $${stopPrice.toFixed(2)} and locks in place.`
              }
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
