// Pure risk / money-path math. NO Deno or external imports, so this same file
// is importable by the Deno edge functions (with the .ts extension) AND by the
// vitest suite under src/ (without extension). Keep it dependency-free.
//
// Every function here mirrors logic that previously lived inline inside
// auto-trading-bot, run-trading-bot, bot-stock-screener, and check-pdt-status.

// ---------------------------------------------------------------------------
// Position sizing & entry-price validation (from auto-trading-bot)
// ---------------------------------------------------------------------------

/** Notional value of a position. */
export function calculatePositionSize(entryPrice: number, quantity: number): number {
  return entryPrice * quantity;
}

/** True if the notional exceeds the user's configured max position size. */
export function exceedsMaxPositionSize(
  entryPrice: number,
  quantity: number,
  maxPositionSize: number,
): boolean {
  return calculatePositionSize(entryPrice, quantity) > maxPositionSize;
}

/** Percentage gap between a recommended entry price and the live price. */
export function priceDeviationPercent(entryPrice: number, livePrice: number): number {
  if (!livePrice) return 0;
  return Math.abs((entryPrice - livePrice) / livePrice) * 100;
}

/** True if entry deviates from live price by more than the allowed percent. */
export function exceedsPriceDeviation(
  entryPrice: number,
  livePrice: number,
  maxDeviationPercent: number,
): boolean {
  return priceDeviationPercent(entryPrice, livePrice) > maxDeviationPercent;
}

// ---------------------------------------------------------------------------
// Loss limits & drawdown (from run-trading-bot)
// ---------------------------------------------------------------------------

/** Sum a numeric field (default `pnl`) across trade rows; missing -> 0. */
export function sumPnL(
  trades: Array<Record<string, unknown>> | null | undefined,
  field = "pnl",
): number {
  if (!trades) return 0;
  return trades.reduce((sum, t) => sum + (Number(t?.[field]) || 0), 0);
}

/** Daily loss breached when realized P&L is below the negative limit. */
export function isDailyLossBreached(todayPnL: number, maxDailyLoss: number): boolean {
  return todayPnL < -maxDailyLoss;
}

/** Weekly loss breached when realized P&L is below the negative limit. */
export function isWeeklyLossBreached(weekPnL: number, maxWeeklyLoss: number): boolean {
  return weekPnL < -maxWeeklyLoss;
}

/** Portfolio drawdown as a percent of the starting balance. */
export function portfolioDrawdownPercent(startingBalance: number, balance: number): number {
  if (!startingBalance) return 0;
  return ((startingBalance - balance) / startingBalance) * 100;
}

/** Drawdown breached at or beyond the configured percent. */
export function isDrawdownBreached(
  startingBalance: number,
  balance: number,
  maxDrawdownPercent: number,
): boolean {
  return portfolioDrawdownPercent(startingBalance, balance) >= maxDrawdownPercent;
}

/** Session trade cap reached at or beyond the limit. */
export function isSessionLimitReached(sessionTradeCount: number, maxSessionTrades: number): boolean {
  return sessionTradeCount >= maxSessionTrades;
}

// ---------------------------------------------------------------------------
// Opportunity scoring (from bot-stock-screener)
// ---------------------------------------------------------------------------

export interface ScoreCriteria {
  volumeSpike?: boolean; // volumeRatio >= 2          -> 20
  rsiSignal?: boolean; // rsi <= 30 || rsi >= 70      -> 20
  nearKeyLevel?: boolean; // within 2% of support     -> 20
  patternDetected?: boolean; //                        -> 20
  sentimentAligned?: boolean; // sentiment == direction -> 15
  ivFavorable?: boolean; // iv rank <30 or >70         -> 5
}

export const SCORE_WEIGHTS = {
  volumeSpike: 20,
  rsiSignal: 20,
  nearKeyLevel: 20,
  patternDetected: 20,
  sentimentAligned: 15,
  ivFavorable: 5,
} as const;

/** Additive 0–100 score from the six screening criteria. */
export function scoreOpportunity(criteria: ScoreCriteria): number {
  let score = 0;
  for (const key of Object.keys(SCORE_WEIGHTS) as Array<keyof typeof SCORE_WEIGHTS>) {
    if (criteria[key]) score += SCORE_WEIGHTS[key];
  }
  return score;
}

export type Recommendation =
  | "strong_opportunity"
  | "moderate_opportunity"
  | "watchlist"
  | "no_trade";

/** Map a score to the recommendation tier (>=85 / >=70 / >=55 / else). */
export function recommendationFromScore(score: number): Recommendation {
  if (score >= 85) return "strong_opportunity";
  if (score >= 70) return "moderate_opportunity";
  if (score >= 55) return "watchlist";
  return "no_trade";
}

// ---------------------------------------------------------------------------
// Pattern Day Trader gating (from check-pdt-status)
// ---------------------------------------------------------------------------

export interface PdtInput {
  accountType: string; // 'cash' | 'margin'
  accountValue: number;
  dayTradeCount: number; // day trades in the rolling 5-day window
  wouldBeDayTrade: boolean;
}

export interface PdtDecision {
  canTrade: boolean;
  warning: boolean;
  blocked: boolean;
  reason: string;
}

/**
 * PDT rules: only apply to margin accounts under $25k. The 4th day trade in a
 * rolling 5-day window is the violation, so a count of 3 blocks the next one,
 * and a count of 2 warns that the next is the 3rd.
 */
export function pdtDecision(input: PdtInput): PdtDecision {
  const ok = (reason: string): PdtDecision => ({ canTrade: true, warning: false, blocked: false, reason });

  if (input.accountType !== "margin") return ok("Cash account - no PDT restrictions");
  if (input.accountValue >= 25000) return ok("Account value above $25k - no PDT restrictions");
  if (!input.wouldBeDayTrade) return ok("Not a day trade");

  if (input.dayTradeCount >= 3) {
    return {
      canTrade: false,
      warning: false,
      blocked: true,
      reason: "Pattern Day Trading limit reached (3 day trades in 5 days)",
    };
  }
  if (input.dayTradeCount === 2) {
    return {
      canTrade: true,
      warning: true,
      blocked: false,
      reason: "This will be your 3rd day trade; one more flags you as a Pattern Day Trader",
    };
  }
  return ok("Within day-trade allowance");
}
