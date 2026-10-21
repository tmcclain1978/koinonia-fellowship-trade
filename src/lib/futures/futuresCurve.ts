/**
 * Futures contract months and forward-curve math (pure, unit-tested).
 *
 * Schwab futures symbols: "/" + root + month code + 2-digit year, e.g.
 * /ESZ26 = S&P 500 E-mini, December 2026. "/ES" alone is the front month.
 */

export const MONTH_CODES = ["F", "G", "H", "J", "K", "M", "N", "Q", "U", "V", "X", "Z"] as const;

export interface FuturesRoot {
  root: string;
  name: string;
  category: "Index" | "Energy" | "Metals" | "Bonds";
  /** Calendar months (1-12) that have contracts. */
  months: number[];
  /** Price digits to show. */
  digits: number;
}

const QUARTERLY = [3, 6, 9, 12];

export const FUTURES_ROOTS: FuturesRoot[] = [
  { root: "ES", name: "S&P 500 E-mini", category: "Index", months: QUARTERLY, digits: 2 },
  { root: "NQ", name: "Nasdaq 100 E-mini", category: "Index", months: QUARTERLY, digits: 2 },
  { root: "YM", name: "Dow E-mini", category: "Index", months: QUARTERLY, digits: 0 },
  { root: "CL", name: "Crude Oil", category: "Energy", months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], digits: 2 },
  { root: "GC", name: "Gold", category: "Metals", months: [2, 4, 6, 8, 10, 12], digits: 1 },
  { root: "ZB", name: "30-Year Treasury Bond", category: "Bonds", months: QUARTERLY, digits: 3 },
];

export interface ContractMonth {
  symbol: string;
  year: number;
  month: number;
  /** "Dec 26" */
  label: string;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The next `count` contract months for a root, starting with the current
 * month (an expired one simply comes back without a quote and is dropped).
 */
export function upcomingContracts(root: FuturesRoot, now: Date, count: number): ContractMonth[] {
  const out: ContractMonth[] = [];
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth() + 1;
  for (let guard = 0; out.length < count && guard < 60; guard++) {
    if (root.months.includes(m)) {
      out.push({ symbol: `/${root.root}${MONTH_CODES[m - 1]}${String(y % 100).padStart(2, "0")}`, year: y, month: m, label: `${MONTH_NAMES[m - 1]} ${String(y % 100).padStart(2, "0")}` });
    }
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export interface CurvePoint {
  symbol: string;
  label: string;
  price: number;
  /** Epoch ms, when Schwab reports it. */
  expiration?: number;
  openInterest?: number;
  volume?: number;
  netPercentChange?: number;
}

export interface CurveShape {
  shape: "contango" | "backwardation" | "flat";
  /** Last listed contract vs. the first, percent. */
  spreadPct: number;
  /** Second contract vs. front, percent, yearly rate (what rolling costs or pays). */
  rollYieldPct: number | null;
}

/** Contango = later months cost more; backwardation = later months cost less. */
export function curveShape(points: CurvePoint[]): CurveShape | null {
  if (points.length < 2) return null;
  const first = points[0].price;
  const last = points[points.length - 1].price;
  const spreadPct = ((last - first) / first) * 100;
  const shape = Math.abs(spreadPct) < 0.05 ? "flat" : spreadPct > 0 ? "contango" : "backwardation";
  let rollYieldPct: number | null = null;
  const [a, b] = points;
  if (a.expiration && b.expiration && b.expiration > a.expiration) {
    const years = (b.expiration - a.expiration) / (365 * 24 * 3600 * 1000);
    if (years > 0.01) rollYieldPct = ((b.price - a.price) / a.price / years) * 100;
  }
  return { shape, spreadPct, rollYieldPct };
}

interface QuoteLike {
  symbol: string;
  lastPrice?: number;
  mark?: number;
  closePrice?: number;
  openInterest?: number;
  volume?: number;
  netPercentChange?: number;
  futureExpirationDate?: number;
  source?: string;
  isPreviousClose?: boolean;
}

/** Turn Schwab quotes into curve points, in contract order. Contracts with no quote are left out. */
export function buildCurve(contracts: ContractMonth[], quotes: QuoteLike[]): CurvePoint[] {
  const by = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));
  const out: CurvePoint[] = [];
  for (const c of contracts) {
    const q = by.get(c.symbol);
    // Only real Schwab quotes: other sources don't carry futures.
    if (!q || q.source || q.isPreviousClose) continue;
    const price = [q.lastPrice, q.mark, q.closePrice].find((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
    if (price === undefined) continue;
    out.push({
      symbol: c.symbol,
      label: c.label,
      price,
      expiration: typeof q.futureExpirationDate === "number" && q.futureExpirationDate > 0 ? q.futureExpirationDate : undefined,
      openInterest: typeof q.openInterest === "number" && q.openInterest >= 0 ? q.openInterest : undefined,
      volume: typeof q.volume === "number" && q.volume >= 0 ? q.volume : undefined,
      netPercentChange: typeof q.netPercentChange === "number" ? q.netPercentChange : undefined,
    });
  }
  // A contract that already expired can still return a stale quote; drop it.
  const now = Date.now();
  return out.filter((p) => !p.expiration || p.expiration > now - 24 * 3600 * 1000);
}
