// Phroureo Exit Strategy Type Definitions

export type ProfitTriggerType = 'UNREALIZED_PL' | 'REALIZED_PL' | 'PRICE_LEVEL';
export type ProfitTriggerUnit = 'DOLLAR' | 'PERCENT';

export type StopSetMode = 
  | 'BREAKEVEN' 
  | 'BREAKEVEN_PLUS' 
  | 'FIXED_PRICE' 
  | 'PERCENT_FROM_ENTRY' 
  | 'PERCENT_FROM_CURRENT' 
  | 'DOLLAR_FROM_ENTRY' 
  | 'ATR_MULTIPLE';

export type TrailingType = 'DOLLAR' | 'PERCENT';
export type TrailStepType = 'DOLLAR_STEP' | 'PERCENT_STEP' | 'TICK_STEP';
export type TrailReference = 'HIGHEST_SINCE_TRIGGER' | 'HIGHEST_SINCE_ENTRY' | 'CURRENT_PRICE';
export type StopSetRounding = 'TICK_SIZE' | 'CENT' | 'NONE';

export type StrategyState = 
  | 'INACTIVE' 
  | 'ARMED' 
  | 'TRIGGERED_STOP_SET' 
  | 'TRAILING_ACTIVE' 
  | 'COMPLETED';

export type PositionSide = 'long' | 'short';
export type PositionType = 'paper' | 'live';

export type EventType = 
  | 'STATE_CHANGE' 
  | 'STOP_UPDATE' 
  | 'TRIGGER_HIT' 
  | 'TRAIL_STEP' 
  | 'ERROR' 
  | 'MANUAL_EDIT'
  | 'CREATED'
  | 'PAUSED'
  | 'RESUMED';

export interface PhroureoExitStrategy {
  id: string;
  user_id: string;
  position_id: string | null;
  position_type: PositionType;
  strategy_name: string;
  symbol: string;
  side: PositionSide;
  entry_price: number;
  quantity: number;
  state: StrategyState;
  enabled: boolean;
  
  // Trigger Settings
  profit_trigger_type: ProfitTriggerType;
  profit_trigger_value: number;
  profit_trigger_unit: ProfitTriggerUnit;
  trigger_once: boolean;
  
  // Stop Set Settings
  stop_set_mode: StopSetMode;
  stop_set_value: number | null;
  stop_set_lock: boolean;
  stop_set_rounding: StopSetRounding;
  
  // Trailing Settings
  enable_trailing: boolean;
  trailing_type: TrailingType | null;
  trailing_amount: number | null;
  trail_step_type: TrailStepType | null;
  trail_step_value: number | null;
  trail_start_delay: number | null;
  trail_reference: TrailReference | null;
  trail_never_loosen: boolean;
  
  // Safety Settings
  max_order_updates_per_minute: number;
  allow_after_hours: boolean;
  slippage_buffer: number | null;
  
  // Tracking
  current_stop_price: number | null;
  reference_price: number | null;
  triggered_at: string | null;
  last_update_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PhroureoStrategyEvent {
  id: string;
  strategy_id: string;
  event_type: EventType;
  previous_state: string | null;
  new_state: string | null;
  previous_stop: number | null;
  new_stop: number | null;
  trigger_price: number | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Form input types for creating/editing strategies
export interface PhroureoStrategyInput {
  strategy_name?: string;
  symbol: string;
  side: PositionSide;
  entry_price: number;
  quantity: number;
  position_id?: string;
  position_type?: PositionType;
  /** Option contract ("CALL 150 2026-11-20"); null for shares. Prices are then option premiums. */
  contract_key?: string | null;
  /** 100 for option contracts, 1 for shares. */
  multiplier?: number;
  
  // Trigger Settings
  profit_trigger_type: ProfitTriggerType;
  profit_trigger_value: number;
  profit_trigger_unit: ProfitTriggerUnit;
  trigger_once?: boolean;
  
  // Stop Set Settings
  stop_set_mode: StopSetMode;
  stop_set_value?: number | null;
  stop_set_lock?: boolean;
  stop_set_rounding?: StopSetRounding;
  
  // Trailing Settings
  enable_trailing?: boolean;
  trailing_type?: TrailingType;
  trailing_amount?: number;
  trail_step_type?: TrailStepType;
  trail_step_value?: number;
  trail_start_delay?: number;
  trail_reference?: TrailReference;
  trail_never_loosen?: boolean;
  
  // Safety Settings
  max_order_updates_per_minute?: number;
  allow_after_hours?: boolean;
  slippage_buffer?: number;
}

// Preset configuration type
export interface PhroureoPreset {
  id: string;
  name: string;
  description: string;
  config: Partial<PhroureoStrategyInput>;
}

// State badge configuration
export const STATE_BADGES: Record<StrategyState, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  INACTIVE: { label: 'Inactive', variant: 'secondary' },
  ARMED: { label: 'Armed', variant: 'default' },
  TRIGGERED_STOP_SET: { label: 'Stop Set', variant: 'outline' },
  TRAILING_ACTIVE: { label: 'Trailing', variant: 'default' },
  COMPLETED: { label: 'Completed', variant: 'secondary' },
};

// Stop set mode labels
export const STOP_SET_MODE_LABELS: Record<StopSetMode, string> = {
  BREAKEVEN: 'Break-Even',
  BREAKEVEN_PLUS: 'Break-Even + Amount',
  FIXED_PRICE: 'Fixed Price',
  PERCENT_FROM_ENTRY: '% Below Entry',
  PERCENT_FROM_CURRENT: '% Below Current',
  DOLLAR_FROM_ENTRY: '$ Below Entry',
  ATR_MULTIPLE: 'ATR Multiple',
};

// Helper to calculate stop price based on mode
export function calculateStopPrice(
  mode: StopSetMode,
  entryPrice: number,
  currentPrice: number,
  side: PositionSide,
  value: number | null,
  atr?: number
): number {
  const isLong = side === 'long';
  const v = value ?? 0;
  
  switch (mode) {
    case 'BREAKEVEN':
      return entryPrice;
    case 'BREAKEVEN_PLUS':
      return isLong ? entryPrice + v : entryPrice - v;
    case 'FIXED_PRICE':
      return v;
    case 'PERCENT_FROM_ENTRY':
      return isLong 
        ? entryPrice * (1 - v / 100) 
        : entryPrice * (1 + v / 100);
    case 'PERCENT_FROM_CURRENT':
      return isLong 
        ? currentPrice * (1 - v / 100) 
        : currentPrice * (1 + v / 100);
    case 'DOLLAR_FROM_ENTRY':
      return isLong ? entryPrice - v : entryPrice + v;
    case 'ATR_MULTIPLE':
      const atrValue = atr ?? 1;
      return isLong 
        ? currentPrice - (atrValue * v) 
        : currentPrice + (atrValue * v);
    default:
      return entryPrice;
  }
}

// Helper to apply rounding
export function applyRounding(price: number, rounding: StopSetRounding, tickSize = 0.01): number {
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
