/**
 * Phroureo exit logic. Pure: given a strategy and the current price, returns
 * what changes. The server runner (phroureo-engine) applies it every minute
 * and keeps a real stop order in step with `current_stop_price`.
 *
 * Prices are in the position's own units: the stock price for shares, the
 * option premium for an option contract (×multiplier for dollars).
 */

export interface PhroureoStrategy {
  id: string;
  side: "long" | "short";
  entry_price: number;
  quantity: number;
  multiplier?: number | null;
  state: string;
  profit_trigger_type: string;
  profit_trigger_value: number;
  profit_trigger_unit: string;
  stop_set_mode: string;
  stop_set_value: number | null;
  stop_set_lock: boolean;
  stop_set_rounding: string;
  enable_trailing: boolean;
  trailing_type: string | null;
  trailing_amount: number | null;
  trail_step_type: string | null;
  trail_step_value: number | null;
  trail_never_loosen: boolean;
  max_order_updates_per_minute: number;
  current_stop_price: number | null;
  reference_price: number | null;
  last_update_at: string | null;
}

export interface StepResult {
  patch: Record<string, unknown>;
  event: null | { event_type: "TRIGGER_HIT" | "TRAIL_STEP"; previous_state: string; new_state: string; previous_stop: number | null; new_stop: number; trigger_price: number; reason: string };
}

const round = (p: number, mode: string) => (mode === "NONE" ? p : Math.round(p * 100) / 100);

export function initialStop(s: PhroureoStrategy, price: number, atr = 0): number {
  const long = s.side === "long";
  const v = Number(s.stop_set_value ?? 0);
  const e = Number(s.entry_price);
  switch (s.stop_set_mode) {
    case "BREAKEVEN": return e;
    case "BREAKEVEN_PLUS": return long ? e + v : e - v;
    case "FIXED_PRICE": return v;
    case "PERCENT_FROM_ENTRY": return long ? e * (1 - v / 100) : e * (1 + v / 100);
    case "PERCENT_FROM_CURRENT": return long ? price * (1 - v / 100) : price * (1 + v / 100);
    case "DOLLAR_FROM_ENTRY": return long ? e - v : e + v;
    case "ATR_MULTIPLE": return atr > 0 ? (long ? price - atr * v : price + atr * v) : (long ? price * 0.98 : price * 1.02);
    default: return e;
  }
}

/** Profit trigger. Dollar amounts use the position's real size (×100 only for options). */
export function triggerMet(s: PhroureoStrategy, price: number): boolean {
  const long = s.side === "long";
  if (s.profit_trigger_type === "PRICE_LEVEL") return long ? price >= s.profit_trigger_value - 1e-9 : price <= s.profit_trigger_value + 1e-9;
  const move = long ? price - s.entry_price : s.entry_price - price;
  const eps = 1e-6; // prices like 2.05 - 2.00 aren't exact in floating point
  if (s.profit_trigger_unit === "PERCENT") return (move / s.entry_price) * 100 >= s.profit_trigger_value - eps;
  return move * s.quantity * (Number(s.multiplier) || 1) >= s.profit_trigger_value - eps;
}

/** A stop must stay on the protective side of the price, or it would fire at once. */
function sane(long: boolean, stop: number, price: number) {
  return long ? stop < price : stop > price;
}

export function stepStrategy(s: PhroureoStrategy, price: number, now: number): StepResult {
  const long = s.side === "long";
  const nowIso = new Date(now).toISOString();
  const tighter = (a: number, b: number) => (long ? Math.max(a, b) : Math.min(a, b));

  if (s.state === "ARMED") {
    if (!triggerMet(s, price)) return { patch: {}, event: null };
    let stop = round(initialStop(s, price), s.stop_set_rounding);
    if (s.stop_set_lock && s.current_stop_price != null) stop = tighter(stop, s.current_stop_price);
    if (!sane(long, stop, price)) stop = round(long ? price * 0.999 : price * 1.001, s.stop_set_rounding);
    const next = s.enable_trailing ? "TRAILING_ACTIVE" : "TRIGGERED_STOP_SET";
    return {
      patch: { state: next, current_stop_price: stop, reference_price: price, triggered_at: nowIso, last_update_at: nowIso },
      event: { event_type: "TRIGGER_HIT", previous_state: "ARMED", new_state: next, previous_stop: s.current_stop_price, new_stop: stop, trigger_price: price, reason: `Profit trigger hit at $${price.toFixed(2)}. Stop set to $${stop.toFixed(2)}.` },
    };
  }

  if ((s.state === "TRIGGERED_STOP_SET" || s.state === "TRAILING_ACTIVE") && s.enable_trailing) {
    const prevRef = s.reference_price ?? price;
    const ref = long ? Math.max(prevRef, price) : Math.min(prevRef, price);
    const amt = Number(s.trailing_amount) || 0;
    if (!(amt > 0)) return { patch: ref !== s.reference_price ? { reference_price: ref } : {}, event: null };
    let ideal = s.trailing_type === "PERCENT" ? (long ? ref * (1 - amt / 100) : ref * (1 + amt / 100)) : (long ? ref - amt : ref + amt);
    ideal = round(ideal, s.stop_set_rounding);
    const step = Number(s.trail_step_value) || 0;
    let stepOk = true;
    if (step > 0 && s.current_stop_price != null) {
      const moved = Math.abs(ideal - s.current_stop_price);
      stepOk = s.trail_step_type === "PERCENT_STEP" ? (moved / s.current_stop_price) * 100 >= step : s.trail_step_type === "TICK_STEP" ? moved >= step * 0.01 - 1e-9 : moved >= step - 1e-9;
    }
    let stop = ideal;
    if (s.trail_never_loosen && s.current_stop_price != null) stop = tighter(stop, s.current_stop_price);
    const changed = s.current_stop_price == null || Math.abs(stop - s.current_stop_price) > 0.001;
    const last = s.last_update_at ? Date.parse(s.last_update_at) : 0;
    const rateOk = now - last >= 60_000 / Math.max(1, s.max_order_updates_per_minute || 10);
    if (stepOk && changed && rateOk && sane(long, stop, price)) {
      return {
        patch: { state: "TRAILING_ACTIVE", current_stop_price: stop, reference_price: ref, last_update_at: nowIso },
        event: { event_type: "TRAIL_STEP", previous_state: s.state, new_state: "TRAILING_ACTIVE", previous_stop: s.current_stop_price, new_stop: stop, trigger_price: price, reason: `Trailing stop moved to $${stop.toFixed(2)} (best price $${ref.toFixed(2)}).` },
      };
    }
    return { patch: ref !== s.reference_price ? { reference_price: ref } : {}, event: null };
  }
  return { patch: {}, event: null };
}
