/**
 * Picks the option to buy for a prediction and estimates what it costs and
 * what it could be worth, from the live Schwab chain.
 *
 *   same day: the nearest expiration (0DTE when there is one), slightly in
 *             the money (delta about 0.65): it follows the stock more
 *             closely and loses less to time decay than an at-the-money one
 *   swing:    an expiration 14-45 days out (closest to 21), delta about 0.55,
 *             expiring BEFORE the next earnings report when possible
 *
 * Contracts with a wide bid/ask gap (over 8% of the price) or little trading
 * are skipped when a better one exists. When options are pricey compared
 * with how much the stock actually moves, a swing trade gets a debit spread
 * (buy one, sell one further out) that costs less and loses less if prices
 * deflate.
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
  /** Percent, as Schwab reports it (e.g. 28.5). */
  impliedVolatility?: number | string | null;
  daysToExpiration?: number | null;
  openInterest?: number;
  volume?: number;
  occSymbol?: string | null;
}

export interface SpreadPick {
  /** The one you sell. */
  shortStrike: number;
  shortBid: number;
  /** Net cost of the spread (per share). */
  debit: number;
  cost: number;
  /** Most it can be worth (per share) = distance between the strikes. */
  width: number;
  maxProfit: number;
  breakEven: number;
  profitAtTarget: number;
  lossAtStop: number;
  label: string;
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
  /** Implied volatility of this contract (decimal), if given. */
  iv: number | null;
  /** IV divided by how much the stock has actually been moving (1.0 = fair; above ~1.25 = pricey). */
  ivVsMove: number | null;
  /** A cheaper debit spread, when options are pricey (swing). */
  debitSpread?: SpreadPick;
  /** Plain warnings (wide gap, thin trading, pricey options, expires after earnings). */
  notes: string[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MAX_SPREAD = 0.08;
export const PRICEY = 1.25;

/** Days from today (ET date) to an expiration date. */
export function daysTo(expiration: string, now: number): number {
  const today = new Date(now).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return Math.round((Date.parse(`${expiration}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** How much the stock has actually moved: annualized volatility of the last 20 daily closes (decimal). */
export function realizedVol(dailyCloses: number[], n = 20): number | null {
  const c = dailyCloses.slice(-(n + 1));
  if (c.length < n + 1) return null;
  const r: number[] = [];
  for (let i = 1; i < c.length; i++) if (c[i - 1] > 0) r.push(Math.log(c[i] / c[i - 1]));
  const m = r.reduce((a, x) => a + x, 0) / r.length;
  const v = r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v * 252);
}

const ivOf = (r: ChainRow) => {
  const v = typeof r.impliedVolatility === "string" ? parseFloat(r.impliedVolatility) : r.impliedVolatility;
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v < 500 ? v / 100 : null;
};
const mid = (r: ChainRow) => (r.mark && r.mark > 0 ? r.mark : (r.bid + r.ask) / 2);
const spreadOf = (r: ChainRow) => (mid(r) > 0 ? (r.ask - r.bid) / mid(r) : 1);
const deltaOf = (r: ChainRow) => (typeof r.delta === "number" && Number.isFinite(r.delta) ? Math.abs(r.delta) : null);
const liquid = (r: ChainRow) => (r.openInterest === undefined && r.volume === undefined) || (r.openInterest ?? 0) >= 100 || (r.volume ?? 0) >= 50;

export interface PickOptions {
  symbol: string;
  dir: "up" | "down";
  mode: Mode;
  spot: number;
  target: number;
  stop: number;
  now: number;
  holdDays?: number;
  /** Next earnings date (YYYY-MM-DD): prefer expirations before it (swing). */
  earnings?: string | null;
  /** Annualized realized volatility (decimal), to judge if options are pricey. */
  realized?: number | null;
  /** Override the delta aimed for. */
  targetDelta?: number;
}

export function pickContract(rows: ChainRow[], o: PickOptions): ContractPick | null {
  const side = o.dir === "up" ? "CALL" : "PUT";
  const usable = rows.filter((r) => String(r.type).toUpperCase() === side && r.bid > 0 && r.ask > 0 && r.ask >= r.bid && /^\d{4}-\d{2}-\d{2}$/.test(r.expiration));
  if (!usable.length) return null;
  const byExp = new Map<string, ChainRow[]>();
  for (const r of usable) {
    if (daysTo(r.expiration, o.now) < 0) continue;
    (byExp.get(r.expiration) ?? byExp.set(r.expiration, []).get(r.expiration)!).push(r);
  }
  const exps = Array.from(byExp.keys()).sort();
  if (!exps.length) return null;
  const notes: string[] = [];
  let exp: string;
  if (o.mode === "sameday") exp = exps[0];
  else {
    const scoreExp = (e: string) => Math.abs(daysTo(e, o.now) - 21);
    let candidates = exps.filter((e) => {
      const d = daysTo(e, o.now);
      return d >= 14 && d <= 45;
    });
    if (!candidates.length) candidates = exps.filter((e) => daysTo(e, o.now) >= 7);
    if (!candidates.length) candidates = exps;
    // Expire before the next earnings report when that still leaves 7+ days.
    if (o.earnings) {
      const before = exps.filter((e) => e < o.earnings! && daysTo(e, o.now) >= 7);
      if (before.length) candidates = before;
      else if (candidates.some((e) => e >= o.earnings!)) notes.push(`expires after earnings (${o.earnings}): prices can drop sharply after the report`);
    }
    exp = candidates.sort((a, b) => scoreExp(a) - scoreExp(b))[0];
  }
  const list = byExp.get(exp)!;
  const aim = o.targetDelta ?? (o.mode === "sameday" ? 0.65 : 0.55);
  // Best by delta, but skip wide or thin contracts when a decent one exists.
  const ranked = [...list].sort((a, b) => {
    const da = deltaOf(a);
    const db = deltaOf(b);
    if (da === null || db === null) return Math.abs(a.strike - o.spot) - Math.abs(b.strike - o.spot);
    return Math.abs(da - aim) - Math.abs(db - aim);
  });
  const good = ranked.filter((r) => spreadOf(r) <= MAX_SPREAD && liquid(r) && (deltaOf(r) === null || Math.abs(deltaOf(r)! - aim) <= 0.2));
  const pick = good[0] ?? ranked[0];
  if (!good.length) {
    if (spreadOf(pick) > MAX_SPREAD) notes.push(`wide bid/ask gap (${Math.round(spreadOf(pick) * 100)}%): you lose that much getting in and out`);
    if (!liquid(pick)) notes.push("thinly traded");
  }
  const m = mid(pick);
  const delta = deltaOf(pick) ?? 0.5;
  const dte = daysTo(exp, o.now);
  const hold = o.holdDays ?? (o.mode === "sameday" ? 15 / 390 : 2.5);
  const days = Math.min(hold, Math.max(dte, 0.2));
  /** Option value after the stock moves `f` dollars in the predicted direction (negative = against). */
  const value = (r: ChainRow, f: number) => {
    const d = deltaOf(r) ?? 0.5;
    const g = r.gamma && r.gamma > 0 ? r.gamma : 0;
    const th = r.theta && r.theta < 0 ? r.theta : 0;
    return Math.max(0.01, mid(r) + d * f + 0.5 * g * f * f + th * days);
  };
  const fT = Math.abs(o.target - o.spot);
  const fS = -Math.abs(o.spot - o.stop);
  const atTarget = value(pick, fT);
  const atStop = value(pick, fS);
  const iv = ivOf(pick);
  const ivVsMove = iv && o.realized && o.realized > 0 ? iv / o.realized : null;
  if (ivVsMove && ivVsMove > PRICEY) notes.push(`options are pricey: they price in ${Math.round(iv! * 100)}% yearly moves, the stock has been moving ${Math.round(o.realized! * 100)}%`);
  const [y, mo, d] = exp.split("-").map(Number);
  const label = (strike: number) => `${o.symbol} ${MONTHS[mo - 1]} ${d}${y !== new Date(o.now).getFullYear() ? ` ${y}` : ""} ${strike} ${side === "CALL" ? "Call" : "Put"}`;

  let debitSpread: SpreadPick | undefined;
  if (o.mode === "swing" && ivVsMove !== null && ivVsMove > PRICEY) {
    // Sell the strike at (or just past) the target.
    const beyond = list
      .filter((r) => (side === "CALL" ? r.strike >= o.target && r.strike > pick.strike : r.strike <= o.target && r.strike < pick.strike) && r.bid > 0)
      .sort((a, b) => Math.abs(a.strike - o.target) - Math.abs(b.strike - o.target));
    const short = beyond[0];
    if (short) {
      const debit = Math.max(0.01, pick.ask - short.bid);
      const width = Math.abs(short.strike - pick.strike);
      const val = (f: number) => Math.min(width, Math.max(0, value(pick, f) - value(short, f)));
      debitSpread = {
        shortStrike: short.strike,
        shortBid: short.bid,
        debit,
        cost: Math.round(debit * 100),
        width,
        maxProfit: Math.round((width - debit) * 100),
        breakEven: side === "CALL" ? pick.strike + debit : pick.strike - debit,
        profitAtTarget: Math.round((val(fT) - debit) * 100),
        lossAtStop: Math.round((val(fS) - debit) * 100),
        label: `${label(pick.strike)} / ${short.strike} debit spread`,
      };
    }
  }

  return {
    side,
    strike: pick.strike,
    expiration: exp,
    dte,
    occSymbol: pick.occSymbol ?? null,
    bid: pick.bid,
    ask: pick.ask,
    mid: m,
    delta,
    cost: Math.round(pick.ask * 100),
    breakEven: side === "CALL" ? pick.strike + pick.ask : pick.strike - pick.ask,
    atTarget,
    atStop,
    profitAtTarget: Math.round((atTarget - pick.ask) * 100),
    lossAtStop: Math.round((atStop - pick.ask) * 100),
    spread: spreadOf(pick),
    label: label(pick.strike),
    iv,
    ivVsMove,
    ...(debitSpread ? { debitSpread } : {}),
    notes,
  };
}
