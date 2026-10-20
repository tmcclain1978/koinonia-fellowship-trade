/**
 * Price levels derived from the option chain. Pure, tested.
 *
 *  - Expected move: the 1-standard-deviation range implied by at-the-money
 *    implied volatility by an expiration (about a 68% range), plus the
 *    at-the-money straddle price as a market-priced cross-check.
 *  - Gamma exposure (GEX): dollar gamma per 1% move, per strike, using the
 *    common convention that dealers are long calls / short puts (calls
 *    count +, puts −). It is a model of positioning, not a fact about it.
 *    Call wall / put wall = strikes with the most call / put gamma; gamma
 *    flip = price where total gamma changes sign.
 *  - Max pain: the expiration price at which option holders' total payout
 *    is lowest.
 *  - Unusual activity: contracts whose volume today is at least their open
 *    interest (new positioning), ranked by volume.
 */
import { bsGreeks } from "../../../../supabase/functions/_shared/greeks";
import { etWallTimeToEpoch } from "../../../../supabase/functions/_shared/candle-buckets";

export interface RawOptionContract {
  type: "CALL" | "PUT" | string;
  strike: number;
  expiration: string; // YYYY-MM-DD
  bid?: number;
  ask?: number;
  mark?: number | null;
  volume?: number;
  openInterest?: number;
  /** Percent, as Schwab reports it (e.g. 28.5). */
  impliedVolatility?: number | string;
  gamma?: number | null;
}

export interface OptionContract {
  type: "call" | "put";
  strike: number;
  expiration: string;
  /** Years to the 4:00 pm ET close on expiration day. */
  t: number;
  /** Decimal (0.285). null if not available. */
  iv: number | null;
  gamma: number | null;
  oi: number;
  volume: number;
  mid: number | null;
}

const YEAR_MS = 365 * 86_400_000;
const MIN_T = 1 / (365 * 24); // one hour: keeps same-day gamma finite
const RISK_FREE = 0.04;

export function expirationTime(expiration: string): number {
  const [y, m, d] = expiration.split("-").map(Number);
  return etWallTimeToEpoch(y, m, d, 16, 0);
}

export function parseChain(raw: RawOptionContract[], now = Date.now()): OptionContract[] {
  const out: OptionContract[] = [];
  for (const r of raw ?? []) {
    const type = String(r.type).toUpperCase() === "CALL" ? "call" : String(r.type).toUpperCase() === "PUT" ? "put" : null;
    if (!type || !Number.isFinite(r.strike) || !/^\d{4}-\d{2}-\d{2}$/.test(r.expiration)) continue;
    const expMs = expirationTime(r.expiration);
    if (expMs <= now) continue; // expired
    const ivPct = typeof r.impliedVolatility === "string" ? parseFloat(r.impliedVolatility) : r.impliedVolatility;
    const iv = typeof ivPct === "number" && ivPct > 0 && ivPct < 500 ? ivPct / 100 : null;
    const bid = Number(r.bid) || 0;
    const ask = Number(r.ask) || 0;
    const mid = typeof r.mark === "number" && r.mark > 0 ? r.mark : bid > 0 && ask >= bid ? (bid + ask) / 2 : null;
    out.push({
      type,
      strike: r.strike,
      expiration: r.expiration,
      t: Math.max((expMs - now) / YEAR_MS, MIN_T),
      iv,
      gamma: typeof r.gamma === "number" && Number.isFinite(r.gamma) && r.gamma >= 0 ? r.gamma : null,
      oi: Math.max(0, Number(r.openInterest) || 0),
      volume: Math.max(0, Number(r.volume) || 0),
      mid,
    });
  }
  return out;
}

export const expirations = (chain: OptionContract[]) => Array.from(new Set(chain.map((c) => c.expiration))).sort();

/* ----------------------------------------------------------------------------
 * Expected move
 * ------------------------------------------------------------------------- */

export interface ExpectedMove {
  expiration: string;
  days: number;
  atmStrike: number;
  /** Decimal at-the-money IV. */
  iv: number;
  /** 1σ move in dollars from IV. */
  move: number;
  upper: number;
  lower: number;
  /** At-the-money straddle price (call mid + put mid), if both quoted. */
  straddle: number | null;
}

export function expectedMove(chain: OptionContract[], spot: number, expiration: string): ExpectedMove | null {
  if (!(spot > 0)) return null;
  const exp = chain.filter((c) => c.expiration === expiration);
  const strikes = Array.from(new Set(exp.map((c) => c.strike))).sort((a, b) => a - b);
  // Strikes with both a call and a put IV.
  const paired = strikes
    .map((k) => {
      const call = exp.find((c) => c.strike === k && c.type === "call");
      const put = exp.find((c) => c.strike === k && c.type === "put");
      return call?.iv && put?.iv ? { k, iv: (call.iv + put.iv) / 2, call, put } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (paired.length === 0) return null;

  // Interpolate IV between the two strikes around spot.
  let iv = paired[0].iv;
  const above = paired.findIndex((p) => p.k >= spot);
  if (above === -1) iv = paired[paired.length - 1].iv;
  else if (above > 0) {
    const a = paired[above - 1];
    const b = paired[above];
    const w = (spot - a.k) / (b.k - a.k);
    iv = a.iv + w * (b.iv - a.iv);
  } else iv = paired[0].iv;

  const atm = paired.reduce((best, p) => (Math.abs(p.k - spot) < Math.abs(best.k - spot) ? p : best));
  const t = atm.call.t;
  const move = spot * iv * Math.sqrt(t);
  const straddle = atm.call.mid !== null && atm.put.mid !== null ? atm.call.mid + atm.put.mid : null;
  return { expiration, days: t * 365, atmStrike: atm.k, iv, move, upper: spot + move, lower: spot - move, straddle };
}

/* ----------------------------------------------------------------------------
 * Gamma exposure
 * ------------------------------------------------------------------------- */

const CONTRACT_SIZE = 100;

/** Dollar gamma per 1% move for one contract line, signed (+calls, −puts). */
function contractGex(c: OptionContract, spot: number, gamma: number) {
  const sign = c.type === "call" ? 1 : -1;
  return sign * gamma * c.oi * CONTRACT_SIZE * spot * spot * 0.01;
}

function gammaAt(c: OptionContract, spot: number): number | null {
  if (c.iv) return bsGreeks(spot, c.strike, c.t, RISK_FREE, c.iv, c.type).gamma;
  return null;
}

export interface StrikeGex {
  strike: number;
  call: number;
  put: number;
  net: number;
}

export interface GammaLevels {
  byStrike: StrikeGex[];
  total: number;
  callWall: number | null;
  putWall: number | null;
  /** Price where total GEX changes sign (nearest to spot), if any in ±15%. */
  flip: number | null;
}

export function gammaLevels(chain: OptionContract[], spot: number): GammaLevels | null {
  if (!(spot > 0)) return null;
  const map = new Map<number, StrikeGex>();
  for (const c of chain) {
    if (!c.oi) continue;
    const g = c.gamma ?? gammaAt(c, spot);
    if (g === null) continue;
    const v = contractGex(c, spot, g);
    const row = map.get(c.strike) ?? { strike: c.strike, call: 0, put: 0, net: 0 };
    if (c.type === "call") row.call += v;
    else row.put += v;
    row.net += v;
    map.set(c.strike, row);
  }
  const byStrike = Array.from(map.values()).sort((a, b) => a.strike - b.strike);
  if (byStrike.length === 0) return null;
  const total = byStrike.reduce((s, r) => s + r.net, 0);
  const callWall = byStrike.reduce<StrikeGex | null>((best, r) => (r.call > (best?.call ?? 0) ? r : best), null)?.strike ?? null;
  const putWall = byStrike.reduce<StrikeGex | null>((best, r) => (r.put < (best?.put ?? 0) ? r : best), null)?.strike ?? null;

  // Gamma flip: re-price every contract's gamma at hypothetical prices.
  const totalAt = (x: number) => {
    let sum = 0;
    for (const c of chain) {
      if (!c.oi) continue;
      const g = gammaAt(c, x);
      if (g !== null) sum += contractGex(c, x, g);
    }
    return sum;
  };
  let flip: number | null = null;
  const step = spot * 0.0025;
  let bestDist = Infinity;
  let prevX = spot * 0.85;
  let prevV = totalAt(prevX);
  for (let x = prevX + step; x <= spot * 1.15 + 1e-9; x += step) {
    const v = totalAt(x);
    if (prevV !== 0 && Math.sign(v) !== Math.sign(prevV)) {
      const cross = prevX + (x - prevX) * (Math.abs(prevV) / (Math.abs(prevV) + Math.abs(v)));
      if (Math.abs(cross - spot) < bestDist) {
        bestDist = Math.abs(cross - spot);
        flip = cross;
      }
    }
    prevX = x;
    prevV = v;
  }
  return { byStrike, total, callWall, putWall, flip };
}

/* ----------------------------------------------------------------------------
 * Max pain
 * ------------------------------------------------------------------------- */

export function maxPain(chain: OptionContract[], expiration: string): number | null {
  const exp = chain.filter((c) => c.expiration === expiration && c.oi > 0);
  if (exp.length === 0) return null;
  const strikes = Array.from(new Set(exp.map((c) => c.strike))).sort((a, b) => a - b);
  let best: number | null = null;
  let bestPain = Infinity;
  for (const p of strikes) {
    let pain = 0;
    for (const c of exp) pain += c.oi * (c.type === "call" ? Math.max(0, p - c.strike) : Math.max(0, c.strike - p));
    if (pain < bestPain) {
      bestPain = pain;
      best = p;
    }
  }
  return best;
}

/* ----------------------------------------------------------------------------
 * Unusual activity & ratios
 * ------------------------------------------------------------------------- */

export interface UnusualContract {
  type: "call" | "put";
  strike: number;
  expiration: string;
  volume: number;
  oi: number;
  /** volume ÷ open interest. */
  ratio: number;
  /** Rough premium traded today (volume × mid × 100). */
  premium: number | null;
}

export function unusualActivity(chain: OptionContract[], opts: { minVolume?: number; minRatio?: number; top?: number } = {}): UnusualContract[] {
  const minVolume = opts.minVolume ?? 500;
  const minRatio = opts.minRatio ?? 1;
  return chain
    .filter((c) => c.volume >= minVolume && c.volume >= minRatio * Math.max(c.oi, 1))
    .map((c) => ({
      type: c.type,
      strike: c.strike,
      expiration: c.expiration,
      volume: c.volume,
      oi: c.oi,
      ratio: c.volume / Math.max(c.oi, 1),
      premium: c.mid !== null ? c.volume * c.mid * CONTRACT_SIZE : null,
    }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, opts.top ?? 6);
}

export function putCallRatios(chain: OptionContract[]) {
  let cv = 0, pv = 0, coi = 0, poi = 0;
  for (const c of chain) {
    if (c.type === "call") { cv += c.volume; coi += c.oi; } else { pv += c.volume; poi += c.oi; }
  }
  return { volume: cv ? pv / cv : null, openInterest: coi ? poi / coi : null };
}
