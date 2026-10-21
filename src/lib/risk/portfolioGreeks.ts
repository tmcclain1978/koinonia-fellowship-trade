/**
 * Portfolio Greeks from real Schwab positions (pure, unit-tested).
 *
 * Schwab's positions list has no Greeks, so they come from option quotes
 * (Schwab sends delta/gamma/theta/vega per share, theta per day, vega per
 * 1 volatility point). If a quote has no Greeks (Schwab uses -999 for "not
 * calculated"), we price the option with Black-Scholes from the quote's
 * implied volatility and the underlying price. If neither is possible the
 * position is listed as missing and left out of the totals; nothing is made up.
 *
 * Units shown to the user:
 *   share delta  = shares of the underlying the position acts like
 *   dollar delta = share delta x underlying price (gain/loss per 1% move = dollar delta / 100)
 *   theta        = dollars per day from time passing
 *   vega         = dollars per 1-point change in implied volatility
 *   gamma        = change in share delta per $1 move in the underlying
 *   gamma1pct    = change in dollar delta if the underlying moves 1% (comparable across stocks)
 */
import { bsGreeks, yearsToExpiry } from "../../../supabase/functions/_shared/greeks";

export interface AccountPosition {
  symbol: string;
  assetType: string;
  /** + long, - short */
  quantity: number;
  marketValue: number;
  underlying?: string;
  description?: string;
}

export interface GreekQuote {
  symbol: string;
  lastPrice?: number;
  mark?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  /** Implied volatility in percent (Schwab), e.g. 32.5 */
  volatility?: number;
  underlyingPrice?: number;
  multiplier?: number;
  /** Fallback quotes (previous close etc.) are not live. */
  source?: string;
}

export type RiskSource = "schwab" | "model" | "price";

export interface PositionRisk {
  symbol: string;
  label: string;
  kind: "stock" | "option";
  quantity: number;
  marketValue: number;
  underlying: string;
  underlyingPrice: number;
  shareDelta: number;
  gamma: number;
  theta: number;
  vega: number;
  dollarDelta: number;
  gamma1pct: number;
  /** Where the Greeks came from. */
  source: RiskSource;
}

export interface PortfolioRisk {
  rows: PositionRisk[];
  /** Positions we couldn't measure (no quote / no Greeks), left out of totals. */
  missing: Array<{ symbol: string; reason: string }>;
  /** Not stocks or options (cash, bonds, funds): not part of the Greeks. */
  skipped: string[];
  dollarDelta: number;
  theta: number;
  vega: number;
  gamma: number;
  gamma1pct: number;
  longDollars: number;
  shortDollars: number;
  /** dollarDelta / SPY price: SPY shares with the same dollar move (assumes each stock moves like SPY). */
  spyShares: number | null;
  /** dollarDelta / account value, percent. */
  netExposurePct: number | null;
}

const STOCK_TYPES = new Set(["EQUITY", "COLLECTIVE_INVESTMENT", "ETF"]);
const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > -999;

/** "AAPL  250117C00185000" (OSI) -> parts. Also accepts no padding. */
export function parseOsi(symbol: string): { underlying: string; expiration: string; type: "call" | "put"; strike: number } | null {
  const m = symbol.trim().match(/^([A-Z.$/]{1,6})\s*(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;
  return {
    underlying: m[1],
    expiration: `20${m[2]}-${m[3]}-${m[4]}`,
    type: m[5] === "C" ? "call" : "put",
    strike: Number(m[6]) / 1000,
  };
}

/** Schwab account positions -> our shape. */
export function positionsFromSchwab(raw: unknown): AccountPosition[] {
  if (!Array.isArray(raw)) return [];
  const out: AccountPosition[] = [];
  for (const p of raw) {
    const inst = (p as { instrument?: Record<string, unknown> })?.instrument;
    const symbol = typeof inst?.symbol === "string" ? inst.symbol : "";
    if (!symbol) continue;
    const r = p as Record<string, unknown>;
    const quantity = (Number(r.longQuantity) || 0) - (Number(r.shortQuantity) || 0);
    if (!quantity) continue;
    out.push({
      symbol,
      assetType: String(inst?.assetType ?? ""),
      quantity,
      marketValue: Number(r.marketValue) || 0,
      underlying: typeof inst?.underlyingSymbol === "string" ? inst.underlyingSymbol : undefined,
      description: typeof inst?.description === "string" ? inst.description : undefined,
    });
  }
  return out;
}

/** Symbols to quote: every position, every option's underlying, and SPY. */
export function quoteSymbols(positions: AccountPosition[]): string[] {
  const s = new Set<string>(["SPY"]);
  for (const p of positions) {
    if (p.assetType === "OPTION") {
      s.add(p.symbol);
      const u = p.underlying ?? parseOsi(p.symbol)?.underlying;
      if (u) s.add(u);
    } else if (STOCK_TYPES.has(p.assetType)) s.add(p.symbol);
  }
  return Array.from(s);
}

const priceOf = (q: GreekQuote | undefined) => (q && ok(q.lastPrice) && q.lastPrice > 0 ? q.lastPrice : q && ok(q.mark) && q.mark > 0 ? q.mark : undefined);

export function computePortfolioRisk(
  positions: AccountPosition[],
  quotes: Map<string, GreekQuote>,
  opts: { accountValue?: number | null; now?: Date; rate?: number } = {},
): PortfolioRisk {
  const rows: PositionRisk[] = [];
  const missing: PortfolioRisk["missing"] = [];
  const skipped: string[] = [];
  const now = opts.now ?? new Date();
  const rate = opts.rate ?? 0.04;

  for (const p of positions) {
    if (STOCK_TYPES.has(p.assetType)) {
      const px = priceOf(quotes.get(p.symbol)) ?? (p.marketValue && p.quantity ? Math.abs(p.marketValue / p.quantity) : undefined);
      if (!px) {
        missing.push({ symbol: p.symbol, reason: "No price" });
        continue;
      }
      rows.push({
        symbol: p.symbol, label: p.symbol, kind: "stock", quantity: p.quantity, marketValue: p.marketValue,
        underlying: p.symbol, underlyingPrice: px, shareDelta: p.quantity, gamma: 0, theta: 0, vega: 0,
        dollarDelta: p.quantity * px, gamma1pct: 0, source: "price",
      });
      continue;
    }
    if (p.assetType !== "OPTION") {
      skipped.push(p.symbol);
      continue;
    }

    const q = quotes.get(p.symbol);
    const osi = parseOsi(p.symbol);
    const underlying = p.underlying ?? osi?.underlying ?? p.symbol;
    const S = (q && ok(q.underlyingPrice) && q.underlyingPrice > 0 ? q.underlyingPrice : undefined) ?? priceOf(quotes.get(underlying));
    const mult = q && ok(q.multiplier) && q.multiplier > 0 ? q.multiplier : 100;
    const label = osi ? `${osi.underlying} ${osi.expiration.slice(5)} ${osi.strike}${osi.type === "call" ? "C" : "P"}` : p.description ?? p.symbol;

    let g: { delta: number; gamma: number; theta: number; vega: number } | null = null;
    let source: RiskSource = "schwab";
    if (q && ok(q.delta) && Math.abs(q.delta) <= 1 && ok(q.gamma) && ok(q.theta) && ok(q.vega)) {
      g = { delta: q.delta, gamma: q.gamma, theta: q.theta, vega: q.vega };
    } else if (osi && S && q && ok(q.volatility) && q.volatility > 0) {
      const m = bsGreeks(S, osi.strike, yearsToExpiry(osi.expiration, now), rate, q.volatility / 100, osi.type);
      g = { delta: m.delta, gamma: m.gamma, theta: m.theta, vega: m.vega };
      source = "model";
    }
    if (!g || !S) {
      missing.push({ symbol: label, reason: !q ? "No option quote" : !S ? "No underlying price" : "Schwab sent no Greeks or volatility" });
      continue;
    }
    const k = p.quantity * mult;
    rows.push({
      symbol: p.symbol, label, kind: "option", quantity: p.quantity, marketValue: p.marketValue,
      underlying, underlyingPrice: S,
      shareDelta: g.delta * k, gamma: g.gamma * k, theta: g.theta * k, vega: g.vega * k,
      dollarDelta: g.delta * k * S, gamma1pct: g.gamma * k * S * S * 0.01, source,
    });
  }

  const sum = (f: (r: PositionRisk) => number) => rows.reduce((a, r) => a + f(r), 0);
  const dollarDelta = sum((r) => r.dollarDelta);
  const spy = priceOf(quotes.get("SPY"));
  const acct = opts.accountValue && opts.accountValue > 0 ? opts.accountValue : null;
  return {
    rows,
    missing,
    skipped,
    dollarDelta,
    theta: sum((r) => r.theta),
    vega: sum((r) => r.vega),
    gamma: sum((r) => r.gamma),
    gamma1pct: sum((r) => r.gamma1pct),
    longDollars: sum((r) => Math.max(0, r.dollarDelta)),
    shortDollars: sum((r) => Math.max(0, -r.dollarDelta)),
    spyShares: spy ? dollarDelta / spy : null,
    netExposurePct: acct ? (dollarDelta / acct) * 100 : null,
  };
}
