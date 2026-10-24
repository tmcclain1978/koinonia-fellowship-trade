/**
 * Picks the option to buy for a prediction and estimates what it costs and
 * what it could be worth, from the live Schwab chain.
 *
 *   same day: the nearest expiration (0DTE when there is one), strike with
 *             delta closest to 0.50 (moves about $0.50 per $1 of stock)
 *   swing:    an expiration 14-45 days out (closest to 21), delta ~0.50, so
 *             a few days of time decay don't eat the whole move
 *
 * Estimates use the option's delta, gamma and theta (a standard shortcut;
 * real prices also move with volatility, so they're labeled "about").
 */
import type { Mode } from "../../../supabase/functions/_shared/patterns/moves";

export interface ChainRow {
  type: string;
  strike: number;
  expiration: string;
  bid: number;
  ask: number;
  mark?: number | null;
  delta?: number | null;
  gamma?: number | null;
  /** Dollars per day (negative). */
  theta?: number | null;
  daysToExpiration?: number | null;
  openInterest?: number;
  volume?: number;
  occSymbol?: string | null;
}

export interface ContractPick {
  side: "CALL" | "PUT";
  strike: number;
  expiration: string;
  dte: number;
  occSymbol: string | null;
  bid: number;
  ask: number;
  mid: number;
  delta: number;
  /** What one contract costs at the ask (x100). */
  cost: number;
  /** Stock price where the option is worth what you paid, at expiration. */
  breakEven: number;
  /** About what the option is worth if the stock hits the target / the stop. */
  atTarget: number;
  atStop: number;
  /** Per contract, buying at the ask. */
  profitAtTarget: number;
  lossAtStop: number;
  /** (ask - bid) / mid */
  spread: number;
  label: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Days from today (ET date) to an expiration date. */
export function daysTo(expiration: string, now: number): number {
  const today = new Date(now).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return Math.round((Date.parse(`${expiration}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function pickContract(
  rows: ChainRow[],
  o: { symbol: string; dir: "up" | "down"; mode: Mode; spot: number; target: number; stop: number; now: number; holdDays?: number },
): ContractPick | null {
  const side = o.dir === "up" ? "CALL" : "PUT";
  const usable = rows.filter((r) => String(r.type).toUpperCase() === side && r.bid > 0 && r.ask > 0 && r.ask >= r.bid && /^\d{4}-\d{2}-\d{2}$/.test(r.expiration));
  if (!usable.length) return null;
  const byExp = new Map<string, ChainRow[]>();
  for (const r of usable) {
    const d = daysTo(r.expiration, o.now);
    if (d < 0) continue;
    (byExp.get(r.expiration) ?? byExp.set(r.expiration, []).get(r.expiration)!).push(r);
  }
  const exps = Array.from(byExp.keys()).sort();
  if (!exps.length) return null;
  let exp: string | undefined;
  if (o.mode === "sameday") exp = exps[0];
  else {
    const inRange = exps.filter((e) => {
      const d = daysTo(e, o.now);
      return d >= 14 && d <= 45;
    });
    exp = (inRange.length ? inRange : exps.filter((e) => daysTo(e, o.now) >= 7)).sort((a, b) => Math.abs(daysTo(a, o.now) - 21) - Math.abs(daysTo(b, o.now) - 21))[0] ?? exps[exps.length - 1];
  }
  const list = byExp.get(exp)!;
  const deltaOf = (r: ChainRow) => (typeof r.delta === "number" && Number.isFinite(r.delta) ? Math.abs(r.delta) : null);
  const withDelta = list.filter((r) => deltaOf(r) !== null);
  const pick = (withDelta.length ? withDelta.sort((a, b) => Math.abs(deltaOf(a)! - 0.5) - Math.abs(deltaOf(b)! - 0.5)) : list.sort((a, b) => Math.abs(a.strike - o.spot) - Math.abs(b.strike - o.spot)))[0];
  const mid = pick.mark && pick.mark > 0 ? pick.mark : (pick.bid + pick.ask) / 2;
  const delta = deltaOf(pick) ?? 0.5;
  const gamma = pick.gamma && pick.gamma > 0 ? pick.gamma : 0;
  const theta = pick.theta && pick.theta < 0 ? pick.theta : 0;
  const dte = daysTo(exp, o.now);
  // Time that passes before the target is reached, in days (about half the time limit).
  const hold = o.holdDays ?? (o.mode === "sameday" ? 15 / 390 : 2.5);
  /** Option value after the stock moves `f` dollars in the predicted direction (negative = against) and `days` pass. */
  const value = (f: number, days: number) => Math.max(0.01, mid + delta * f + 0.5 * gamma * f * f + theta * Math.min(days, Math.max(dte, 0.2)));
  const atTarget = value(Math.abs(o.target - o.spot), hold);
  const atStop = value(-Math.abs(o.spot - o.stop), hold);
  const [y, m, d] = exp.split("-").map(Number);
  return {
    side,
    strike: pick.strike,
    expiration: exp,
    dte,
    occSymbol: pick.occSymbol ?? null,
    bid: pick.bid,
    ask: pick.ask,
    mid,
    delta,
    cost: Math.round(pick.ask * 100),
    breakEven: side === "CALL" ? pick.strike + pick.ask : pick.strike - pick.ask,
    atTarget,
    atStop,
    profitAtTarget: Math.round((atTarget - pick.ask) * 100),
    lossAtStop: Math.round((atStop - pick.ask) * 100),
    spread: mid > 0 ? (pick.ask - pick.bid) / mid : 1,
    label: `${o.symbol} ${MONTHS[m - 1]} ${d}${y !== new Date(o.now).getFullYear() ? ` ${y}` : ""} ${pick.strike} ${side === "CALL" ? "Call" : "Put"}`,
  };
}
