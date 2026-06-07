import { describe, it, expect } from "vitest";
import {
  calculatePositionSize,
  exceedsMaxPositionSize,
  priceDeviationPercent,
  exceedsPriceDeviation,
  sumPnL,
  isDailyLossBreached,
  isWeeklyLossBreached,
  portfolioDrawdownPercent,
  isDrawdownBreached,
  isSessionLimitReached,
  scoreOpportunity,
  recommendationFromScore,
  pdtDecision,
} from "../../supabase/functions/_shared/risk-math";

describe("position sizing", () => {
  it("computes notional", () => {
    expect(calculatePositionSize(10, 5)).toBe(50);
  });

  it("does NOT flag a position exactly at the max (strict >)", () => {
    // $100 entry x 10 = $1000, max $1000 -> allowed
    expect(exceedsMaxPositionSize(100, 10, 1000)).toBe(false);
  });

  it("flags a position above the max", () => {
    expect(exceedsMaxPositionSize(100, 11, 1000)).toBe(true);
  });
});

describe("price deviation", () => {
  it("is symmetric and percent-based", () => {
    expect(priceDeviationPercent(102, 100)).toBeCloseTo(2);
    expect(priceDeviationPercent(98, 100)).toBeCloseTo(2);
  });

  it("guards divide-by-zero live price", () => {
    expect(priceDeviationPercent(100, 0)).toBe(0);
  });

  it("allows exactly the max deviation (strict >)", () => {
    expect(exceedsPriceDeviation(102, 100, 2)).toBe(false); // exactly 2% allowed
    expect(exceedsPriceDeviation(103, 100, 2)).toBe(true); // 3% blocked
  });
});

describe("pnl summation", () => {
  it("handles null/empty", () => {
    expect(sumPnL(null)).toBe(0);
    expect(sumPnL([])).toBe(0);
  });

  it("sums and treats missing as zero", () => {
    expect(sumPnL([{ pnl: 100 }, { pnl: -40 }, { other: 5 }])).toBe(60);
  });
});

describe("loss limits (boundary: exactly at -limit is NOT a breach)", () => {
  it("daily", () => {
    expect(isDailyLossBreached(-500, 500)).toBe(false); // exactly -limit
    expect(isDailyLossBreached(-500.01, 500)).toBe(true);
    expect(isDailyLossBreached(-100, 500)).toBe(false);
  });

  it("weekly", () => {
    expect(isWeeklyLossBreached(-2000, 2000)).toBe(false);
    expect(isWeeklyLossBreached(-2001, 2000)).toBe(true);
  });
});

describe("drawdown (boundary: exactly at limit IS a breach, >=)", () => {
  it("computes percent of starting balance", () => {
    expect(portfolioDrawdownPercent(10000, 9500)).toBeCloseTo(5);
  });

  it("guards zero starting balance", () => {
    expect(portfolioDrawdownPercent(0, 100)).toBe(0);
  });

  it("breaches at exactly the limit", () => {
    expect(isDrawdownBreached(10000, 9500, 5)).toBe(true); // exactly 5%
    expect(isDrawdownBreached(10000, 9600, 5)).toBe(false); // 4%
  });
});

describe("session limit (>=)", () => {
  it("reached at the cap", () => {
    expect(isSessionLimitReached(5, 5)).toBe(true);
    expect(isSessionLimitReached(4, 5)).toBe(false);
  });
});

describe("opportunity scoring", () => {
  it("zero when nothing matches", () => {
    expect(scoreOpportunity({})).toBe(0);
  });

  it("sums to 100 when everything matches", () => {
    expect(
      scoreOpportunity({
        volumeSpike: true,
        rsiSignal: true,
        nearKeyLevel: true,
        patternDetected: true,
        sentimentAligned: true,
        ivFavorable: true,
      }),
    ).toBe(100);
  });

  it("weights individual criteria correctly", () => {
    expect(scoreOpportunity({ sentimentAligned: true })).toBe(15);
    expect(scoreOpportunity({ ivFavorable: true })).toBe(5);
    expect(scoreOpportunity({ volumeSpike: true, rsiSignal: true })).toBe(40);
  });

  it("maps scores to recommendation tiers at the exact thresholds", () => {
    expect(recommendationFromScore(85)).toBe("strong_opportunity");
    expect(recommendationFromScore(84)).toBe("moderate_opportunity");
    expect(recommendationFromScore(70)).toBe("moderate_opportunity");
    expect(recommendationFromScore(69)).toBe("watchlist");
    expect(recommendationFromScore(55)).toBe("watchlist");
    expect(recommendationFromScore(54)).toBe("no_trade");
    expect(recommendationFromScore(0)).toBe("no_trade");
  });
});

describe("pattern day trader gating", () => {
  const base = { accountValue: 10000, dayTradeCount: 0, wouldBeDayTrade: true };

  it("cash accounts are never restricted", () => {
    const d = pdtDecision({ ...base, accountType: "cash", dayTradeCount: 9 });
    expect(d.canTrade).toBe(true);
    expect(d.blocked).toBe(false);
  });

  it("margin >= $25k is never restricted", () => {
    const d = pdtDecision({ ...base, accountType: "margin", accountValue: 25000, dayTradeCount: 9 });
    expect(d.canTrade).toBe(true);
  });

  it("non-day-trades pass regardless of count", () => {
    const d = pdtDecision({ ...base, accountType: "margin", wouldBeDayTrade: false, dayTradeCount: 9 });
    expect(d.canTrade).toBe(true);
  });

  it("allows first two day trades", () => {
    expect(pdtDecision({ ...base, accountType: "margin", dayTradeCount: 0 }).canTrade).toBe(true);
    expect(pdtDecision({ ...base, accountType: "margin", dayTradeCount: 1 }).canTrade).toBe(true);
  });

  it("warns on the 2 count (next is the 3rd)", () => {
    const d = pdtDecision({ ...base, accountType: "margin", dayTradeCount: 2 });
    expect(d.canTrade).toBe(true);
    expect(d.warning).toBe(true);
  });

  it("blocks at 3+ day trades under $25k margin", () => {
    expect(pdtDecision({ ...base, accountType: "margin", dayTradeCount: 3 }).blocked).toBe(true);
    expect(pdtDecision({ ...base, accountType: "margin", dayTradeCount: 4 }).canTrade).toBe(false);
  });
});
