import { describe, it, expect } from "vitest";
import { botPhase, previousTradingDays, sessionFor } from "../../supabase/functions/_shared/bot/session";
import { evaluateEntry, isSignal, type Signal } from "../../supabase/functions/_shared/bot/strategy";
import { accountGate, entryPriceCheck, exitDecision, sizePosition, slip, type RiskSettings } from "../../supabase/functions/_shared/bot/risk";
import { runBacktest } from "../../supabase/functions/_shared/bot/backtest";
import { sessionBars, et } from "./botFixtures";

const RISK: RiskSettings = { riskPerTradePct: 0.5, maxPositionDollars: 10_000, maxOpenPositions: 3, maxTradesPerDay: 5, maxDailyLoss: 500, pdtGuard: true, breakevenAt1R: true };

describe("market clock", () => {
  it("knows the session, the opening wait, the last hour and the flatten time", () => {
    const d = "2026-10-20"; // Tuesday
    expect(botPhase(et(d, 9, 0))).toBe("closed");
    expect(botPhase(et(d, 9, 35))).toBe("opening");
    expect(botPhase(et(d, 9, 45))).toBe("entries");
    expect(botPhase(et(d, 14, 59))).toBe("entries");
    expect(botPhase(et(d, 15, 0))).toBe("manage_only");
    expect(botPhase(et(d, 15, 50))).toBe("flatten");
    expect(botPhase(et(d, 16, 0))).toBe("closed");
  });

  it("skips holidays and weekends, and closes early the day after Thanksgiving", () => {
    expect(botPhase(et("2026-11-26", 11, 0))).toBe("closed"); // Thanksgiving
    expect(botPhase(et("2026-10-24", 11, 0))).toBe("closed"); // Saturday
    expect(sessionFor(et("2026-11-27", 10, 0)).close).toBe(13 * 60);
    expect(botPhase(et("2026-11-27", 12, 50))).toBe("flatten");
    expect(botPhase(et("2026-11-27", 12, 0))).toBe("manage_only");
  });

  it("counts back trading days", () => {
    expect(previousTradingDays(et("2026-10-20", 10, 0), 4)).toEqual(["2026-10-19", "2026-10-16", "2026-10-15", "2026-10-14"]);
    expect(previousTradingDays(et("2026-11-30", 10, 0), 2)).toEqual(["2026-11-27", "2026-11-25"]);
  });
});

describe("trend-pullback entry", () => {
  const bars = sessionBars(["2026-10-19", "2026-10-20"], { drift: 0.03, wave: 0.1 });
  const signals: Signal[] = [];
  for (let i = 60; i < bars.length; i++) {
    const r = evaluateEntry("TEST", bars.slice(0, i + 1));
    if (isSignal(r)) signals.push(r);
  }

  it("finds setups in a rising market with pullbacks", () => {
    expect(signals.length).toBeGreaterThan(1);
  });

  it("every setup has stop < entry < target at the chosen reward:risk, with a sane stop", () => {
    for (const s of signals) {
      expect(s.stop).toBeLessThan(s.entry);
      expect(s.target).toBeGreaterThan(s.entry);
      expect((s.target - s.entry) / (s.entry - s.stop)).toBeCloseTo(2, 1);
      expect(s.risk).toBeGreaterThanOrEqual(0.25 * s.atr - 1e-9);
      expect(s.risk / s.entry).toBeLessThanOrEqual(0.03);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
  });

  it("never fires in a falling market", () => {
    const down = sessionBars(["2026-10-19", "2026-10-20"], { drift: -0.05, wave: 0.12 });
    for (let i = 60; i < down.length; i++) expect(isSignal(evaluateEntry("DN", down.slice(0, i + 1)))).toBe(false);
  });

  it("explains why it passes", () => {
    const r = evaluateEntry("X", bars.slice(0, 10));
    expect(isSignal(r)).toBe(false);
    expect((r as { why: string }).why).toMatch(/not enough history/);
  });

  it("is deterministic", () => {
    const i = bars.length - 30;
    expect(evaluateEntry("T", bars.slice(0, i))).toEqual(evaluateEntry("T", bars.slice(0, i)));
  });
});

describe("sizing and gates", () => {
  it("risks the set percent of equity, capped by position size and buying power", () => {
    // $25k × 0.5% = $125 risk; $0.50/share → 250 shares; $100 × 250 = $25k > $10k cap → 100 shares.
    expect(sizePosition(25_000, 25_000, 100, 99.5, RISK)).toMatchObject({ qty: 100, limitedBy: "max_position" });
    expect(sizePosition(25_000, 25_000, 100, 98, { ...RISK, maxPositionDollars: 1e9 })).toMatchObject({ qty: 62, limitedBy: "risk" });
    expect(sizePosition(25_000, 1_000, 100, 99.5, RISK)).toMatchObject({ qty: 10, limitedBy: "buying_power" });
    expect(sizePosition(25_000, 25_000, 100, 101, RISK).qty).toBe(0);
  });

  const st = { todayPnl: 0, tradesToday: 0, openPositions: 0, symbolsTradedToday: new Set<string>(), equity: 30_000, dayTradesLast5: 0 };
  it("stops new trades at the daily loss, trade count, open positions and PDT limits", () => {
    expect(accountGate(st, RISK).ok).toBe(true);
    expect(accountGate({ ...st, todayPnl: -500 }, RISK).reason).toMatch(/daily loss/);
    expect(accountGate({ ...st, tradesToday: 5 }, RISK).reason).toMatch(/trades today/);
    expect(accountGate({ ...st, openPositions: 3 }, RISK).reason).toMatch(/open positions/);
    expect(accountGate({ ...st, equity: 20_000, dayTradesLast5: 3 }, RISK).reason).toMatch(/pattern-day-trader/);
    expect(accountGate({ ...st, equity: 30_000, dayTradesLast5: 3 }, RISK).ok).toBe(true);
    expect(accountGate({ ...st, equity: 20_000, dayTradesLast5: 3 }, { ...RISK, pdtGuard: false }).ok).toBe(true);
  });

  it("won't chase: price must still be near the signal and above the stop", () => {
    const sig = { entry: 100, stop: 99, risk: 1 };
    expect(entryPriceCheck(sig, 100.4).ok).toBe(true);
    expect(entryPriceCheck(sig, 100.6).reason).toMatch(/ran away/);
    expect(entryPriceCheck(sig, 98.9).reason).toMatch(/below the stop/);
    expect(entryPriceCheck(sig, NaN).ok).toBe(false);
  });
});

describe("exits", () => {
  const t = { entryPrice: 100, stop: 99, target: 102, initialStop: 99 };
  const w = (h: number, l: number, last = (h + l) / 2, open = last) => ({ high: h, low: l, last, open });
  it("stop first when a window hits both; gaps fill at the open", () => {
    expect(exitDecision(t, w(102.5, 98.5), { flatten: false, breakevenAt1R: true })).toMatchObject({ action: "exit", reason: "stop", price: 99 });
    expect(exitDecision(t, w(99.5, 98, 98.2, 98.4), { flatten: false, breakevenAt1R: true })).toMatchObject({ reason: "stop", price: 98.4 });
    expect(exitDecision(t, w(102.1, 100.5), { flatten: false, breakevenAt1R: true })).toMatchObject({ reason: "target", price: 102 });
  });
  it("moves the stop to break-even at +1R, and closes at the end of the day", () => {
    expect(exitDecision(t, w(101.1, 100.2), { flatten: false, breakevenAt1R: true })).toMatchObject({ action: "move_stop", stop: 100 });
    expect(exitDecision(t, w(101.1, 100.2), { flatten: false, breakevenAt1R: false })).toEqual({ action: "hold" });
    expect(exitDecision(t, w(100.6, 100.2, 100.5), { flatten: true, breakevenAt1R: true })).toMatchObject({ reason: "end_of_day", price: 100.5 });
  });
  it("slippage hurts both ways", () => {
    expect(slip(100, "buy", 2)).toBe(100.02);
    expect(slip(100, "sell", 2)).toBe(99.98);
  });
});

describe("backtest", () => {
  const dates = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19", "2026-10-20"];
  const res = runBacktest({
    bars: { UP: sessionBars(dates, { drift: 0.03, wave: 0.1, seed: 1 }), UP2: sessionBars(dates, { drift: 0.03, wave: 0.1, seed: 2, start: 50 }), DN: sessionBars(dates, { drift: -0.05, seed: 3 }) },
    startingEquity: 25_000, risk: RISK, rewardRisk: 2, slippageBps: 2, fromDate: "2026-10-13",
  });

  it("follows the rules: long only, flat every night, limits respected", () => {
    expect(res.trades.length).toBeGreaterThan(0);
    expect(res.trades.every((t) => t.symbol !== "DN")).toBe(true);
    for (const t of res.trades) {
      expect(t.date >= "2026-10-13").toBe(true);
      expect(new Date(t.exitTime).toISOString().slice(0, 10) <= t.date || t.reason === "end_of_day").toBe(true);
      expect(t.qty * t.entry).toBeLessThanOrEqual(RISK.maxPositionDollars + 1);
      expect(["stop", "target", "end_of_day"]).toContain(t.reason);
    }
    const perDay = new Map<string, number>();
    for (const t of res.trades) perDay.set(`${t.date}:${t.symbol}`, (perDay.get(`${t.date}:${t.symbol}`) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBe(1); // one entry per symbol per day
  });

  it("stats add up", () => {
    const sum = res.trades.reduce((a, t) => a + t.pnl, 0);
    expect(res.stats.totalPnl).toBeCloseTo(sum, 1);
    expect(res.stats.endingEquity).toBeCloseTo(25_000 + sum, 1);
    expect(res.days.map((d) => d.date)).toEqual(dates.slice(1));
  });
});
