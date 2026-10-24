/**
 * What the option chain itself says about a prediction:
 *
 *   walls: the strikes with the most call gamma (call wall) and put gamma
 *          (put wall). Price often stalls at them, so a wall between the
 *          entry and the target is a reason to skip (the "room" filter).
 *   flow:  unusual buying today (volume above open interest = new
 *          positions). Big call buying backs a CALL; big put buying is a
 *          warning against it.
 */
import { gammaLevels, parseChain, unusualActivity, type RawOptionContract } from "@/components/charts/options/optionsLevels";
import type { ChainRow } from "./contractPicker";

export interface ChainView {
  callWall: number | null;
  putWall: number | null;
  /** A wall sits between the entry and the target. */
  wallInWay: { price: number; kind: "call wall" | "put wall" } | null;
  /** Unusual premium bought today, calls vs puts (dollars). */
  flow: { calls: number; puts: number; side: "calls" | "puts" | null } | null;
}

export function chainView(rows: ChainRow[], o: { spot: number; dir: "up" | "down"; entry: number; target: number; atr: number; now: number }): ChainView {
  const parsed = parseChain(rows as unknown as RawOptionContract[], o.now);
  const g = parsed.length ? gammaLevels(parsed, o.spot) : null;
  const callWall = g?.callWall ?? null;
  const putWall = g?.putWall ?? null;
  const buffer = 0.15 * o.atr;
  const between = (x: number | null) => x !== null && (o.dir === "up" ? x > o.entry + buffer && x < o.target : x < o.entry - buffer && x > o.target);
  let wallInWay: ChainView["wallInWay"] = null;
  if (between(callWall)) wallInWay = { price: callWall!, kind: "call wall" };
  else if (between(putWall)) wallInWay = { price: putWall!, kind: "put wall" };
  const unusual = parsed.length ? unusualActivity(parsed, { minVolume: 300, minRatio: 1, top: 30 }) : [];
  let calls = 0;
  let puts = 0;
  for (const u of unusual) {
    if (u.premium === null) continue;
    if (u.type === "call") calls += u.premium;
    else puts += u.premium;
  }
  const flow = calls + puts > 0 ? { calls, puts, side: calls > 1.5 * puts ? ("calls" as const) : puts > 1.5 * calls ? ("puts" as const) : null } : null;
  return { callWall, putWall, wallInWay, flow };
}
