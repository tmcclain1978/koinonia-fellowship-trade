/**
 * Replays the bot's rules over past 5-minute bars. Same entry rules, sizing,
 * gates and exits as the live engine, with these simplifications (all on the
 * cautious side):
 *   - entries fill at the NEXT bar's open, plus slippage
 *   - exits are checked on 5-minute bars; if one bar touches both the stop
 *     and the target, the stop counts
 *   - the AI check isn't replayed (it can only remove trades)
 */
import { botPhase, etClock } from "./session.ts";
import { accountGate, entryPriceCheck, exitDecision, sizePosition, slip, type RiskSettings } from "./risk.ts";
import { DEFAULT_PARAMS, evaluateEntry, isSignal, type Bar, type StrategyParams } from "./strategy.ts";

export interface BacktestTrade {
  symbol: string;
  date: string;
  entryTime: number;
  exitTime: number;
  qty: number;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  reason: string;
  pnl: number;
  r: number;
  score: number;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  days: Array<{ date: string; pnl: number; equity: number; trades: number }>;
  stats: {
    trades: number;
    wins: number;
    winRate: number;
    totalPnl: number;
    avgR: number;
    profitFactor: number | null;
    maxDrawdown: number;
    endingEquity: number;
  };
}

export interface BacktestInput {
  bars: Record<string, Bar[]>; // 5-minute regular-session bars per symbol, oldest first
  startingEquity: number;
  risk: RiskSettings;
  rewardRisk: number;
  slippageBps: number;
  params?: StrategyParams;
  /** Only trade on these dates (YYYY-MM-DD); earlier bars are warm-up. */
  fromDate?: string;
}

interface Open {
  symbol: string;
  qty: number;
  entry: number;
  stop: number;
  initialStop: number;
  target: number;
  entryTime: number;
  score: number;
  date: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function runBacktest(inp: BacktestInput): BacktestResult {
  const params = { ...(inp.params ?? DEFAULT_PARAMS), rewardRisk: inp.rewardRisk };
  const BAR = 5 * 60_000;
  // Index bars by symbol and time.
  const index = new Map<string, Map<number, number>>();
  const times = new Set<number>();
  for (const [sym, list] of Object.entries(inp.bars)) {
    const m = new Map<number, number>();
    list.forEach((b, i) => { m.set(b.t, i); times.add(b.t); });
    index.set(sym, m);
  }
  const timeline = [...times].sort((a, b) => a - b);

  let equity = inp.startingEquity;
  const trades: BacktestTrade[] = [];
  const days: BacktestResult["days"] = [];
  let open: Open[] = [];
  let day = "";
  let dayPnl = 0;
  let dayTrades = 0;
  let traded = new Set<string>();
  const dayTradeDates: string[] = []; // one entry per trade, for the PDT window
  const tradingDates: string[] = [];

  const closeTrade = (o: Open, price: number, t: number, reason: string) => {
    const exit = slip(price, "sell", inp.slippageBps);
    const pnl = r2((exit - o.entry) * o.qty);
    const r = Math.round(((exit - o.entry) / (o.entry - o.initialStop)) * 100) / 100;
    equity += pnl;
    dayPnl += pnl;
    trades.push({ symbol: o.symbol, date: o.date, entryTime: o.entryTime, exitTime: t, qty: o.qty, entry: o.entry, exit, stop: o.stop, target: o.target, reason, pnl, r, score: o.score });
  };

  const finishDay = () => {
    if (day && (!inp.fromDate || day >= inp.fromDate)) days.push({ date: day, pnl: r2(dayPnl), equity: r2(equity), trades: dayTrades });
  };

  for (const t of timeline) {
    const date = etClock(t).date;
    if (date !== day) {
      // Anything still open at the end of a day closes at that day's last price.
      for (const o of open) {
        const list = inp.bars[o.symbol];
        const last = [...list].reverse().find((b) => etClock(b.t).date === day);
        if (last) closeTrade(o, last.c, last.t + BAR, "end_of_day");
      }
      open = [];
      finishDay();
      day = date;
      dayPnl = 0;
      dayTrades = 0;
      traded = new Set();
      tradingDates.push(date);
    }
    const active = !inp.fromDate || date >= inp.fromDate;
    // Bar t has just closed at t + BAR. The phase at that moment decides what's allowed.
    const phase = botPhase(t + BAR);

    // 1. Manage open trades on this bar.
    const still: Open[] = [];
    for (const o of open) {
      const i = index.get(o.symbol)?.get(t);
      if (i === undefined) { still.push(o); continue; }
      const b = inp.bars[o.symbol][i];
      if (b.t < o.entryTime) { still.push(o); continue; }
      const d = exitDecision({ entryPrice: o.entry, stop: o.stop, target: o.target, initialStop: o.initialStop }, { high: b.h, low: b.l, last: b.c, open: b.o }, { flatten: phase === "flatten" || phase === "closed", breakevenAt1R: inp.risk.breakevenAt1R });
      if (d.action === "exit") closeTrade(o, d.price, b.t + BAR, d.reason);
      else {
        if (d.action === "move_stop") o.stop = d.stop;
        still.push(o);
      }
    }
    open = still;

    // 2. Entries after this bar closes, filled at the next bar's open.
    if (!active || phase !== "entries") continue;
    const recentDates = tradingDates.slice(-5);
    const unreal = 0; // exits are bar-based; unrealized is ignored for the gate
    const gate = accountGate({
      todayPnl: dayPnl + unreal,
      tradesToday: dayTrades,
      openPositions: open.length,
      symbolsTradedToday: traded,
      equity,
      dayTradesLast5: dayTradeDates.filter((d) => recentDates.includes(d)).length,
    }, inp.risk);
    if (!gate.ok) continue;

    const candidates = [];
    for (const [sym, list] of Object.entries(inp.bars)) {
      if (traded.has(sym) || open.some((o) => o.symbol === sym)) continue;
      const i = index.get(sym)!.get(t);
      if (i === undefined || i + 1 >= list.length) continue;
      const next = list[i + 1];
      if (etClock(next.t).date !== date) continue;
      const sig = evaluateEntry(sym, list.slice(Math.max(0, i - 160), i + 1), params);
      if (isSignal(sig)) candidates.push({ sig, next });
    }
    candidates.sort((a, b) => b.sig.score - a.sig.score);
    for (const { sig, next } of candidates) {
      if (open.length >= inp.risk.maxOpenPositions || dayTrades >= inp.risk.maxTradesPerDay) break;
      const fill = slip(next.o, "buy", inp.slippageBps);
      if (!entryPriceCheck(sig, fill).ok) continue;
      const openCost = open.reduce((a, o) => a + o.entry * o.qty, 0);
      const size = sizePosition(equity, equity - openCost, fill, sig.stop, inp.risk);
      if (size.qty < 1) continue;
      const target = r2(fill + inp.rewardRisk * (fill - sig.stop));
      open.push({ symbol: sig.symbol, qty: size.qty, entry: fill, stop: sig.stop, initialStop: sig.stop, target, entryTime: next.t, score: sig.score, date });
      traded.add(sig.symbol);
      dayTrades++;
      dayTradeDates.push(date);
    }
  }
  for (const o of open) {
    const list = inp.bars[o.symbol];
    const last = list[list.length - 1];
    closeTrade(o, last.c, last.t + BAR, "end_of_day");
  }
  finishDay();

  const wins = trades.filter((t) => t.pnl > 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = -trades.filter((t) => t.pnl < 0).reduce((a, t) => a + t.pnl, 0);
  let peak = inp.startingEquity, maxDd = 0, eq = inp.startingEquity;
  for (const t of [...trades].sort((a, b) => a.exitTime - b.exitTime)) {
    eq += t.pnl;
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, peak - eq);
  }
  return {
    trades,
    days,
    stats: {
      trades: trades.length,
      wins: wins.length,
      winRate: trades.length ? Math.round((wins.length / trades.length) * 1000) / 10 : 0,
      totalPnl: r2(trades.reduce((a, t) => a + t.pnl, 0)),
      avgR: trades.length ? Math.round((trades.reduce((a, t) => a + t.r, 0) / trades.length) * 100) / 100 : 0,
      profitFactor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : null,
      maxDrawdown: r2(maxDd),
      endingEquity: r2(equity),
    },
  };
}
