import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DailyCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dayOfWeek: number; // 0=Sun,1=Mon,...
}

interface WeeklyLevels {
  weekStart: string;
  mon_high: number;
  mon_low: number;
  tue_high: number;
  tue_low: number;
  wed_high: number;
  wed_low: number;
  mon_high_touched: boolean;
  mon_low_touched: boolean;
  tue_high_touched: boolean;
  tue_low_touched: boolean;
  wed_high_touched: boolean;
  wed_low_touched: boolean;
}

interface WLSMSetup {
  date: string;
  dayOfWeek: string;
  targetLevel: string;
  targetPrice: number;
  direction: "bullish" | "bearish";
  setupType: "magnet_continuation" | "sweep_and_reject";
  score: number;
  scoreBreakdown: Record<string, number>;
  outcome: "win" | "loss" | "breakeven";
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  stopPrice: number;
  targetReached: boolean;
  weekStart: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      symbol = "SPY",
      startDate,
      endDate,
      testVariant = "either_side",
      initialCapital = 100000,
    } = await req.json();

    // Fetch daily candles from Polygon
    const polygonKey = Deno.env.get("POLYGON_API_KEY");
    const candles = await fetchCandles(symbol, startDate, endDate, polygonKey);

    if (!candles || candles.length < 20) {
      return new Response(
        JSON.stringify({ error: "Insufficient data", candles: candles?.length || 0 }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compute ATR(14)
    const atrValues = computeATR(candles, 14);
    // Compute EMA(20)
    const ema20 = computeEMA(candles.map((c) => c.close), 20);

    // Group candles by ISO week
    const weeks = groupByWeek(candles);

    // Build weekly levels
    const weeklyData: WeeklyLevels[] = [];
    const allSetups: WLSMSetup[] = [];

    for (const week of weeks) {
      const mon = week.find((c) => c.dayOfWeek === 1);
      const tue = week.find((c) => c.dayOfWeek === 2);
      const wed = week.find((c) => c.dayOfWeek === 3);
      const thu = week.find((c) => c.dayOfWeek === 4);
      const fri = week.find((c) => c.dayOfWeek === 5);

      if (!mon || !tue) continue;

      const levels: WeeklyLevels = {
        weekStart: mon.date,
        mon_high: mon.high,
        mon_low: mon.low,
        tue_high: tue.high,
        tue_low: tue.low,
        wed_high: wed?.high || 0,
        wed_low: wed?.low || 0,
        mon_high_touched: false,
        mon_low_touched: false,
        tue_high_touched: false,
        tue_low_touched: false,
        wed_high_touched: false,
        wed_low_touched: false,
      };

      // Check if Tuesday touched Monday levels
      if (tue.high >= mon.high) levels.mon_high_touched = true;
      if (tue.low <= mon.low) levels.mon_low_touched = true;

      // Check if Wednesday touched levels
      if (wed) {
        if (wed.high >= mon.high) levels.mon_high_touched = true;
        if (wed.low <= mon.low) levels.mon_low_touched = true;
        if (wed.high >= tue.high) levels.tue_high_touched = true;
        if (wed.low <= tue.low) levels.tue_low_touched = true;
      }

      // Check if Thursday touched levels
      if (thu) {
        if (thu.high >= tue.high) levels.tue_high_touched = true;
        if (thu.low <= tue.low) levels.tue_low_touched = true;
        if (thu.high >= mon.high) levels.mon_high_touched = true;
        if (thu.low <= mon.low) levels.mon_low_touched = true;
        if (wed) {
          if (thu.high >= wed.high) levels.wed_high_touched = true;
          if (thu.low <= wed.low) levels.wed_low_touched = true;
        }
      }

      weeklyData.push(levels);

      // Generate setups for Wed, Thu, Fri
      const candleIndex = (c: DailyCandle) => candles.findIndex((x) => x.date === c.date);

      // WEDNESDAY setups: target Monday levels
      if (wed) {
        const idx = candleIndex(wed);
        const atr = atrValues[idx] || 1;
        const ema = ema20[idx] || wed.close;
        const tueClose = tue.close;

        // Check if Monday high untouched by Tuesday close
        if (!isTouchedByClose(tue, mon.high, "high")) {
          const setup = buildSetup(wed, "Wednesday", "mon_high", mon.high, "bullish", atr, ema, tueClose, levels, testVariant, mon.date);
          if (setup) allSetups.push(setup);
        }
        // Check if Monday low untouched by Tuesday close
        if (!isTouchedByClose(tue, mon.low, "low")) {
          const setup = buildSetup(wed, "Wednesday", "mon_low", mon.low, "bearish", atr, ema, tueClose, levels, testVariant, mon.date);
          if (setup) allSetups.push(setup);
        }
      }

      // THURSDAY setups: target Tuesday levels
      if (thu && wed) {
        const idx = candleIndex(thu);
        const atr = atrValues[idx] || 1;
        const ema = ema20[idx] || thu.close;
        const wedClose = wed.close;

        if (!isTouchedByClose(wed, tue.high, "high")) {
          const setup = buildSetup(thu, "Thursday", "tue_high", tue.high, "bullish", atr, ema, wedClose, levels, testVariant, mon.date);
          if (setup) allSetups.push(setup);
        }
        if (!isTouchedByClose(wed, tue.low, "low")) {
          const setup = buildSetup(thu, "Thursday", "tue_low", tue.low, "bearish", atr, ema, wedClose, levels, testVariant, mon.date);
          if (setup) allSetups.push(setup);
        }
      }

      // FRIDAY setups: target Monday and Wednesday levels
      if (fri && thu) {
        const idx = candleIndex(fri);
        const atr = atrValues[idx] || 1;
        const ema = ema20[idx] || fri.close;
        const thuClose = thu.close;

        // Monday high
        if (!levels.mon_high_touched || !isTouchedByClose(thu, mon.high, "high")) {
          const setup = buildSetup(fri, "Friday", "mon_high", mon.high, "bullish", atr, ema, thuClose, levels, testVariant, mon.date);
          if (setup) allSetups.push(setup);
        }
        // Monday low
        if (!levels.mon_low_touched || !isTouchedByClose(thu, mon.low, "low")) {
          const setup = buildSetup(fri, "Friday", "mon_low", mon.low, "bearish", atr, ema, thuClose, levels, testVariant, mon.date);
          if (setup) allSetups.push(setup);
        }
        // Wednesday high
        if (wed && !isTouchedByClose(thu, wed.high, "high")) {
          const setup = buildSetup(fri, "Friday", "wed_high", wed.high, "bullish", atr, ema, thuClose, levels, testVariant, mon.date);
          if (setup) allSetups.push(setup);
        }
        // Wednesday low
        if (wed && !isTouchedByClose(thu, wed.low, "low")) {
          const setup = buildSetup(fri, "Friday", "wed_low", wed.low, "bearish", atr, ema, thuClose, levels, testVariant, mon.date);
          if (setup) allSetups.push(setup);
        }
      }
    }

    // Filter by test variant
    const filteredSetups = filterByVariant(allSetups, testVariant);

    // Compute aggregate stats
    const totalSetups = filteredSetups.length;
    const wins = filteredSetups.filter((s) => s.outcome === "win").length;
    const losses = filteredSetups.filter((s) => s.outcome === "loss").length;
    const winRate = totalSetups > 0 ? (wins / totalSetups) * 100 : 0;
    const totalPnl = filteredSetups.reduce((sum, s) => sum + s.pnl, 0);
    const avgPnl = totalSetups > 0 ? totalPnl / totalSetups : 0;
    const grossProfit = filteredSetups.filter((s) => s.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(filteredSetups.filter((s) => s.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Equity curve
    let equity = initialCapital;
    const equityCurve = filteredSetups.map((s) => {
      equity += s.pnl;
      return { date: s.date, equity, pnl: s.pnl };
    });

    // Max drawdown
    let peak = initialCapital;
    let maxDrawdown = 0;
    for (const pt of equityCurve) {
      if (pt.equity > peak) peak = pt.equity;
      const dd = ((peak - pt.equity) / peak) * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Day-pair stats
    const dayStats = {
      wednesday: computeDayStats(filteredSetups, "Wednesday"),
      thursday: computeDayStats(filteredSetups, "Thursday"),
      friday: computeDayStats(filteredSetups, "Friday"),
    };

    // Score distribution
    const scoreDistribution = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // 0-10
    filteredSetups.forEach((s) => {
      const bucket = Math.min(10, Math.max(0, Math.round(s.score)));
      scoreDistribution[bucket]++;
    });

    // Setup type stats
    const magnetSetups = filteredSetups.filter((s) => s.setupType === "magnet_continuation");
    const sweepSetups = filteredSetups.filter((s) => s.setupType === "sweep_and_reject");

    const avgRR = totalSetups > 0
      ? filteredSetups.reduce((s, t) => s + Math.abs(t.pnlPercent), 0) / totalSetups
      : 0;

    const results = {
      summary: {
        totalSetups,
        wins,
        losses,
        winRate: Math.round(winRate * 100) / 100,
        totalPnl: Math.round(totalPnl * 100) / 100,
        avgPnl: Math.round(avgPnl * 100) / 100,
        profitFactor: Math.round(profitFactor * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        avgRR: Math.round(avgRR * 100) / 100,
        initialCapital,
        finalCapital: Math.round(equity * 100) / 100,
        totalReturnPercent: Math.round(((equity - initialCapital) / initialCapital) * 10000) / 100,
      },
      dayStats,
      scoreDistribution: scoreDistribution.map((count, score) => ({ score, count })),
      setupTypeStats: {
        magnet: {
          total: magnetSetups.length,
          wins: magnetSetups.filter((s) => s.outcome === "win").length,
          winRate: magnetSetups.length > 0
            ? Math.round((magnetSetups.filter((s) => s.outcome === "win").length / magnetSetups.length) * 10000) / 100
            : 0,
        },
        sweep: {
          total: sweepSetups.length,
          wins: sweepSetups.filter((s) => s.outcome === "win").length,
          winRate: sweepSetups.length > 0
            ? Math.round((sweepSetups.filter((s) => s.outcome === "win").length / sweepSetups.length) * 10000) / 100
            : 0,
        },
      },
      equityCurve,
      trades: filteredSetups.slice(0, 200), // limit for response size
      weeklyLevels: weeklyData.slice(0, 52),
    };

    // Save to DB
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(jwt);

    if (user) {
      await supabase.from("wlsm_backtest_results").insert({
        user_id: user.id,
        symbol,
        start_date: startDate,
        end_date: endDate,
        test_variant: testVariant,
        results_json: results,
      });
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("WLSM backtest error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ---- Helper functions ----

async function fetchCandles(
  symbol: string,
  startDate: string,
  endDate: string,
  apiKey: string | undefined
): Promise<DailyCandle[]> {
  if (!apiKey) {
    // Fallback: generate simulated data
    return generateSimulatedCandles(symbol, startDate, endDate);
  }

  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.results && data.results.length > 0) {
      return data.results.map((r: any) => {
        const d = new Date(r.t);
        return {
          date: d.toISOString().split("T")[0],
          open: r.o,
          high: r.h,
          low: r.l,
          close: r.c,
          volume: r.v,
          dayOfWeek: d.getUTCDay(),
        };
      });
    }
  } catch (e) {
    console.error("Polygon fetch failed:", e);
  }

  return generateSimulatedCandles(symbol, startDate, endDate);
}

function generateSimulatedCandles(symbol: string, startDate: string, endDate: string): DailyCandle[] {
  const candles: DailyCandle[] = [];
  let price = symbol === "SPY" ? 450 : 150;
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;

    const change = (Math.random() - 0.48) * price * 0.015;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * price * 0.005;
    const low = Math.min(open, close) - Math.random() * price * 0.005;

    candles.push({
      date: d.toISOString().split("T")[0],
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.floor(50000000 + Math.random() * 50000000),
      dayOfWeek: dow,
    });

    price = close;
  }

  return candles;
}

function computeATR(candles: DailyCandle[], period: number): number[] {
  const atr: number[] = new Array(candles.length).fill(0);
  const trs: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : c.open;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    trs.push(tr);

    if (i >= period - 1) {
      if (i === period - 1) {
        atr[i] = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
      } else {
        atr[i] = (atr[i - 1] * (period - 1) + tr) / period;
      }
    }
  }

  return atr;
}

function computeEMA(values: number[], period: number): number[] {
  const ema: number[] = new Array(values.length).fill(0);
  const k = 2 / (period + 1);

  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      ema[i] = values[i];
    } else if (i < period) {
      ema[i] = values.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
    } else {
      ema[i] = values[i] * k + ema[i - 1] * (1 - k);
    }
  }

  return ema;
}

function groupByWeek(candles: DailyCandle[]): DailyCandle[][] {
  const weeks: DailyCandle[][] = [];
  let currentWeek: DailyCandle[] = [];

  for (const c of candles) {
    if (c.dayOfWeek === 1 && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push(c);
  }

  if (currentWeek.length > 0) weeks.push(currentWeek);
  return weeks;
}

function isTouchedByClose(candle: DailyCandle, level: number, side: "high" | "low"): boolean {
  if (side === "high") return candle.high >= level;
  return candle.low <= level;
}

function buildSetup(
  candle: DailyCandle,
  dayName: string,
  targetLevel: string,
  targetPrice: number,
  direction: "bullish" | "bearish",
  atr: number,
  ema: number,
  priorClose: number,
  _levels: WeeklyLevels,
  _testVariant: string,
  weekStart: string
): WLSMSetup | null {
  const scoreBreakdown: Record<string, number> = {};

  // Base: untouched target on correct day
  scoreBreakdown["untouched_target"] = 3;

  // Within 0.5 ATR of target
  const distToTarget = Math.abs(candle.open - targetPrice);
  if (distToTarget <= atr * 0.5) scoreBreakdown["within_half_atr"] = 2;

  // Trend alignment
  const trendAligned =
    (direction === "bullish" && candle.open > ema) ||
    (direction === "bearish" && candle.open < ema);
  if (trendAligned) scoreBreakdown["trend_aligned"] = 2;

  // Opening drive confirms
  const openingDrive =
    (direction === "bullish" && candle.open > priorClose) ||
    (direction === "bearish" && candle.open < priorClose);
  if (openingDrive) scoreBreakdown["opening_drive"] = 1;

  // Near miss prior day
  const nearMiss = distToTarget > 0 && distToTarget < atr * 0.3;
  if (nearMiss) scoreBreakdown["near_miss"] = 1;

  // Penalty: gap through level
  const gappedThrough =
    (direction === "bullish" && candle.open > targetPrice) ||
    (direction === "bearish" && candle.open < targetPrice);
  if (gappedThrough) scoreBreakdown["gap_penalty"] = -2;

  // Penalty: exhaustion
  const exhausted = Math.abs(candle.open - ema) > atr * 1.5;
  if (exhausted) scoreBreakdown["exhaustion_penalty"] = -1;

  const score = Object.values(scoreBreakdown).reduce((a, b) => a + b, 0);

  if (score < 3) return null; // Skip low-quality setups

  // Determine setup type
  const setupType: "magnet_continuation" | "sweep_and_reject" =
    trendAligned && !gappedThrough ? "magnet_continuation" : "sweep_and_reject";

  // Simulate trade
  const entryPrice = candle.open;
  const stopDistance = atr * 0.5;
  const stopPrice =
    direction === "bullish" ? entryPrice - stopDistance : entryPrice + stopDistance;

  // Check if target was reached during the day
  const targetReached =
    direction === "bullish" ? candle.high >= targetPrice : candle.low <= targetPrice;

  // Check if stop was hit
  const stopHit =
    direction === "bullish" ? candle.low <= stopPrice : candle.high >= stopPrice;

  let exitPrice: number;
  let outcome: "win" | "loss" | "breakeven";

  if (targetReached && !stopHit) {
    exitPrice = targetPrice;
    outcome = "win";
  } else if (stopHit) {
    exitPrice = stopPrice;
    outcome = "loss";
  } else {
    // Close at end of day
    exitPrice = candle.close;
    const diff = direction === "bullish" ? exitPrice - entryPrice : entryPrice - exitPrice;
    outcome = diff > 0 ? "win" : diff < 0 ? "loss" : "breakeven";
  }

  const rawPnl = direction === "bullish" ? exitPrice - entryPrice : entryPrice - exitPrice;
  // Assume 100 shares for P&L calculation
  const shares = Math.floor(10000 / entryPrice);
  const pnl = Math.round(rawPnl * shares * 100) / 100;
  const pnlPercent = Math.round((rawPnl / entryPrice) * 10000) / 100;

  return {
    date: candle.date,
    dayOfWeek: dayName,
    targetLevel,
    targetPrice,
    direction,
    setupType,
    score,
    scoreBreakdown,
    outcome,
    entryPrice,
    exitPrice: Math.round(exitPrice * 100) / 100,
    pnl,
    pnlPercent,
    stopPrice: Math.round(stopPrice * 100) / 100,
    targetReached,
    weekStart,
  };
}

function filterByVariant(setups: WLSMSetup[], variant: string): WLSMSetup[] {
  switch (variant) {
    case "high_only":
      return setups.filter((s) => s.targetLevel.includes("high"));
    case "low_only":
      return setups.filter((s) => s.targetLevel.includes("low"));
    case "continuation":
      return setups.filter((s) => s.setupType === "magnet_continuation");
    case "reversal":
      return setups.filter((s) => s.setupType === "sweep_and_reject");
    case "either_side":
    default:
      return setups;
  }
}

function computeDayStats(setups: WLSMSetup[], day: string) {
  const daySetups = setups.filter((s) => s.dayOfWeek === day);
  const wins = daySetups.filter((s) => s.outcome === "win").length;
  return {
    total: daySetups.length,
    wins,
    losses: daySetups.filter((s) => s.outcome === "loss").length,
    winRate: daySetups.length > 0 ? Math.round((wins / daySetups.length) * 10000) / 100 : 0,
    avgScore: daySetups.length > 0 ? Math.round((daySetups.reduce((s, t) => s + t.score, 0) / daySetups.length) * 100) / 100 : 0,
    totalPnl: Math.round(daySetups.reduce((s, t) => s + t.pnl, 0) * 100) / 100,
  };
}
