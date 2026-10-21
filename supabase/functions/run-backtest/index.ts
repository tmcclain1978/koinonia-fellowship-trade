import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BacktestParams {
  userId: string;
  strategyId?: string;
  strategy: {
    entry_conditions: ConditionGroup[];
    exit_conditions: ConditionGroup[];
    stop_loss_percent?: number;
    take_profit_percent?: number;
  };
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  runMonteCarlo?: boolean;
  monteCarloRuns?: number;
  runWalkForward?: boolean;
  walkForwardFolds?: number;
  walkForwardInSampleRatio?: number;
}

interface ConditionGroup {
  id: string;
  indicator: string;
  operator: string;
  value: string;
  logic?: 'AND' | 'OR';
}

interface Trade {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  direction: 'long' | 'short';
  quantity: number;
  pnl: number;
  pnlPercent: number;
}

interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

interface HistoricalDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const params: BacktestParams = await req.json();
    console.log("Running backtest with params:", JSON.stringify(params, null, 2));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch real historical data
    let historicalData: HistoricalDataPoint[];
    try {
      historicalData = await fetchRealMarketData(params.symbol, params.startDate, params.endDate, params.timeframe);
      console.log(`Fetched ${historicalData.length} real data points for ${params.symbol}`);
    } catch (error) {
      // A backtest on made-up prices says nothing about the strategy; refuse instead.
      console.log(`Real data fetch failed: ${(error as Error).message}`);
      return new Response(
        JSON.stringify({ success: false, error: `Couldn't load real price history for ${params.symbol} (${(error as Error).message}). The backtest was not run.` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (historicalData.length < 50) {
      throw new Error(`Insufficient data points (${historicalData.length}). Need at least 50 for backtesting.`);
    }

    // Run the main backtest simulation
    const result = runBacktestSimulation(
      historicalData,
      params.strategy,
      params.initialCapital
    );

    // Run Monte Carlo simulation if requested
    let monteCarloResults = null;
    if (params.runMonteCarlo && result.trades.length >= 5) {
      monteCarloResults = runMonteCarloSimulation(
        result.trades,
        params.initialCapital,
        params.monteCarloRuns || 1000
      );
      console.log("Monte Carlo simulation completed");
    }

    // Run Walk-Forward Optimization if requested
    let walkForwardResults = null;
    if (params.runWalkForward) {
      walkForwardResults = runWalkForwardOptimization(
        historicalData,
        params.strategy,
        params.initialCapital,
        params.walkForwardFolds || 5,
        params.walkForwardInSampleRatio || 0.7
      );
      console.log("Walk-Forward optimization completed");
    }

    // Save result to database
    const { data: savedResult, error: saveError } = await supabase
      .from('backtest_results')
      .insert({
        user_id: params.userId,
        strategy_id: params.strategyId || null,
        symbol: params.symbol,
        timeframe: params.timeframe,
        start_date: params.startDate,
        end_date: params.endDate,
        initial_capital: params.initialCapital,
        final_capital: result.finalCapital,
        total_return_percent: result.totalReturnPercent,
        total_trades: result.totalTrades,
        winning_trades: result.winningTrades,
        losing_trades: result.losingTrades,
        win_rate: result.winRate,
        profit_factor: result.profitFactor,
        max_drawdown_percent: result.maxDrawdownPercent,
        sharpe_ratio: result.sharpeRatio,
        sortino_ratio: result.sortinoRatio,
        avg_trade_return: result.avgTradeReturn,
        avg_win: result.avgWin,
        avg_loss: result.avgLoss,
        largest_win: result.largestWin,
        largest_loss: result.largestLoss,
        avg_holding_period: result.avgHoldingPeriod,
        trades: result.trades,
        equity_curve: result.equityCurve,
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving result:", saveError);
      throw saveError;
    }

    console.log("Backtest completed successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        result: savedResult,
        monteCarlo: monteCarloResults,
        walkForward: walkForwardResults,
        dataSource: historicalData.length > 0 ? 'real' : 'simulated'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Backtest error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Fetch real market data from Polygon.io or Alpha Vantage
async function fetchRealMarketData(
  symbol: string,
  startDate: string,
  endDate: string,
  timeframe: string
): Promise<HistoricalDataPoint[]> {
  // Try Polygon.io first (better for historical data)
  const polygonKey = Deno.env.get('POLYGON_API_KEY');
  if (polygonKey) {
    try {
      const data = await fetchFromPolygon(symbol, startDate, endDate, timeframe, polygonKey);
      if (data.length > 0) return data;
    } catch (e) {
      console.log("Polygon fetch failed:", e.message);
    }
  }

  // Fall back to Alpha Vantage
  const alphaKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
  if (alphaKey) {
    try {
      const data = await fetchFromAlphaVantage(symbol, timeframe, alphaKey);
      // Filter by date range
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      return data.filter(d => {
        const t = new Date(d.date).getTime();
        return t >= start && t <= end;
      });
    } catch (e) {
      console.log("Alpha Vantage fetch failed:", e.message);
    }
  }

  throw new Error("No market data API available");
}

async function fetchFromPolygon(
  symbol: string,
  startDate: string,
  endDate: string,
  timeframe: string,
  apiKey: string
): Promise<HistoricalDataPoint[]> {
  // Map timeframe to Polygon multiplier/timespan
  const timespanMap: Record<string, { multiplier: number; timespan: string }> = {
    '1m': { multiplier: 1, timespan: 'minute' },
    '5m': { multiplier: 5, timespan: 'minute' },
    '15m': { multiplier: 15, timespan: 'minute' },
    '1h': { multiplier: 1, timespan: 'hour' },
    '4h': { multiplier: 4, timespan: 'hour' },
    '1D': { multiplier: 1, timespan: 'day' },
    '1W': { multiplier: 1, timespan: 'week' },
  };

  const { multiplier, timespan } = timespanMap[timeframe] || { multiplier: 1, timespan: 'day' };
  
  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${startDate}/${endDate}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;
  
  console.log(`Fetching from Polygon: ${symbol} ${startDate} to ${endDate}`);
  
  const response = await fetch(url);
  const data = await response.json();

  if (data.status === 'ERROR' || !data.results) {
    throw new Error(data.message || 'Failed to fetch from Polygon');
  }

  return data.results.map((bar: any) => ({
    date: new Date(bar.t).toISOString(),
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
    volume: bar.v
  }));
}

async function fetchFromAlphaVantage(
  symbol: string,
  timeframe: string,
  apiKey: string
): Promise<HistoricalDataPoint[]> {
  let func = 'TIME_SERIES_DAILY';
  let interval = '';
  let seriesKey = 'Time Series (Daily)';

  if (timeframe !== '1D' && timeframe !== '1W') {
    func = 'TIME_SERIES_INTRADAY';
    interval = `&interval=${timeframe === '1h' ? '60min' : timeframe}`;
    seriesKey = `Time Series (${timeframe === '1h' ? '60min' : timeframe})`;
  }

  const url = `https://www.alphavantage.co/query?function=${func}&symbol=${symbol}${interval}&outputsize=full&apikey=${apiKey}`;
  
  console.log(`Fetching from Alpha Vantage: ${symbol}`);
  
  const response = await fetch(url);
  const data = await response.json();

  if (data['Error Message'] || data['Note']) {
    throw new Error(data['Error Message'] || data['Note']);
  }

  const series = data[seriesKey];
  if (!series) {
    throw new Error(`No data found for ${symbol}`);
  }

  return Object.entries(series)
    .map(([timestamp, values]: [string, any]) => ({
      date: new Date(timestamp).toISOString(),
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      volume: parseInt(values['5. volume'])
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// Fallback: Generate simulated historical data
function generateHistoricalData(
  symbol: string, 
  startDate: string, 
  endDate: string, 
  timeframe: string
): HistoricalDataPoint[] {
  const data: HistoricalDataPoint[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let basePrice = symbol === 'AAPL' ? 150 : 
                  symbol === 'MSFT' ? 350 : 
                  symbol === 'GOOGL' ? 140 :
                  symbol === 'TSLA' ? 250 :
                  symbol === 'AMZN' ? 175 : 100;
  
  let currentPrice = basePrice;
  const volatility = 0.02;
  
  const intervalMs = timeframe === '1m' ? 60000 :
                     timeframe === '5m' ? 300000 :
                     timeframe === '15m' ? 900000 :
                     timeframe === '1h' ? 3600000 :
                     timeframe === '4h' ? 14400000 :
                     timeframe === '1D' ? 86400000 :
                     timeframe === '1W' ? 604800000 : 86400000;

  let currentDate = new Date(start);
  
  while (currentDate <= end) {
    if (timeframe === '1D' || timeframe === '1W') {
      const day = currentDate.getDay();
      if (day === 0 || day === 6) {
        currentDate = new Date(currentDate.getTime() + intervalMs);
        continue;
      }
    }
    
    const trend = Math.sin(data.length / 50) * 0.001;
    const change = (Math.random() - 0.5) * volatility + trend;
    
    const open = currentPrice;
    const close = currentPrice * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
    const volume = Math.floor(1000000 + Math.random() * 5000000);
    
    data.push({
      date: currentDate.toISOString(),
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume
    });
    
    currentPrice = close;
    currentDate = new Date(currentDate.getTime() + intervalMs);
  }
  
  return data;
}

// Monte Carlo Simulation
interface MonteCarloResult {
  percentile5: number;
  percentile25: number;
  median: number;
  percentile75: number;
  percentile95: number;
  mean: number;
  standardDeviation: number;
  probabilityOfProfit: number;
  probabilityOfLoss: number;
  expectedValue: number;
  confidenceInterval95: [number, number];
  ruinProbability: number;
  distribution: { bucket: string; count: number }[];
  equityCurves: { run: number; equity: number[] }[];
}

function runMonteCarloSimulation(
  trades: Trade[],
  initialCapital: number,
  numRuns: number = 1000
): MonteCarloResult {
  console.log(`Running ${numRuns} Monte Carlo simulations with ${trades.length} trades`);
  
  const tradeReturns = trades.map(t => t.pnlPercent);
  const finalReturns: number[] = [];
  const equityCurves: { run: number; equity: number[] }[] = [];
  let ruinCount = 0;
  
  // Run simulations
  for (let run = 0; run < numRuns; run++) {
    let equity = initialCapital;
    const curve: number[] = [equity];
    
    // Shuffle trades randomly (bootstrap sampling with replacement)
    const shuffledReturns = [...tradeReturns].sort(() => Math.random() - 0.5);
    
    for (const ret of shuffledReturns) {
      const tradeAmount = equity * 0.1; // Risk 10% per trade
      const pnl = tradeAmount * (ret / 100);
      equity += pnl;
      curve.push(equity);
      
      // Check for ruin (equity drops below 10% of initial)
      if (equity < initialCapital * 0.1) {
        ruinCount++;
        break;
      }
    }
    
    finalReturns.push(((equity - initialCapital) / initialCapital) * 100);
    
    // Store sample curves for visualization (first 10 runs)
    if (run < 10) {
      equityCurves.push({ run, equity: curve });
    }
  }
  
  // Sort for percentile calculations
  finalReturns.sort((a, b) => a - b);
  
  // Calculate statistics
  const mean = finalReturns.reduce((a, b) => a + b, 0) / numRuns;
  const variance = finalReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / numRuns;
  const standardDeviation = Math.sqrt(variance);
  
  const profitableRuns = finalReturns.filter(r => r > 0).length;
  const losingRuns = finalReturns.filter(r => r < 0).length;
  
  // Percentiles
  const getPercentile = (p: number) => finalReturns[Math.floor(p * numRuns / 100)];
  
  // Create distribution buckets
  const minReturn = Math.floor(Math.min(...finalReturns) / 10) * 10;
  const maxReturn = Math.ceil(Math.max(...finalReturns) / 10) * 10;
  const buckets: Record<string, number> = {};
  
  for (let i = minReturn; i <= maxReturn; i += 10) {
    buckets[`${i}% to ${i + 10}%`] = 0;
  }
  
  for (const ret of finalReturns) {
    const bucket = Math.floor(ret / 10) * 10;
    const key = `${bucket}% to ${bucket + 10}%`;
    if (buckets[key] !== undefined) {
      buckets[key]++;
    }
  }
  
  const distribution = Object.entries(buckets)
    .map(([bucket, count]) => ({ bucket, count }))
    .filter(d => d.count > 0);
  
  return {
    percentile5: parseFloat(getPercentile(5).toFixed(2)),
    percentile25: parseFloat(getPercentile(25).toFixed(2)),
    median: parseFloat(getPercentile(50).toFixed(2)),
    percentile75: parseFloat(getPercentile(75).toFixed(2)),
    percentile95: parseFloat(getPercentile(95).toFixed(2)),
    mean: parseFloat(mean.toFixed(2)),
    standardDeviation: parseFloat(standardDeviation.toFixed(2)),
    probabilityOfProfit: parseFloat(((profitableRuns / numRuns) * 100).toFixed(2)),
    probabilityOfLoss: parseFloat(((losingRuns / numRuns) * 100).toFixed(2)),
    expectedValue: parseFloat((mean * initialCapital / 100).toFixed(2)),
    confidenceInterval95: [
      parseFloat(getPercentile(2.5).toFixed(2)),
      parseFloat(getPercentile(97.5).toFixed(2))
    ],
    ruinProbability: parseFloat(((ruinCount / numRuns) * 100).toFixed(2)),
    distribution,
    equityCurves
  };
}

// Walk-Forward Optimization
interface WalkForwardResult {
  inSamplePeriods: { startDate: string; endDate: string; returnPercent: number; winRate: number; trades: number }[];
  outOfSamplePeriods: { startDate: string; endDate: string; returnPercent: number; winRate: number; trades: number }[];
  inSampleAvgReturn: number;
  outOfSampleAvgReturn: number;
  robustnessRatio: number;
  isRobust: boolean;
  totalFolds: number;
}

function runWalkForwardOptimization(
  data: HistoricalDataPoint[],
  strategy: BacktestParams['strategy'],
  initialCapital: number,
  folds: number = 5,
  inSampleRatio: number = 0.7
): WalkForwardResult {
  console.log(`Running walk-forward with ${folds} folds, ${(inSampleRatio * 100).toFixed(0)}% in-sample`);
  
  const inSamplePeriods: WalkForwardResult['inSamplePeriods'] = [];
  const outOfSamplePeriods: WalkForwardResult['outOfSamplePeriods'] = [];
  
  const foldSize = Math.floor(data.length / folds);
  
  for (let fold = 0; fold < folds; fold++) {
    const foldStart = fold * foldSize;
    const foldEnd = fold === folds - 1 ? data.length : (fold + 1) * foldSize;
    const foldData = data.slice(foldStart, foldEnd);
    
    if (foldData.length < 60) continue;
    
    const inSampleSize = Math.floor(foldData.length * inSampleRatio);
    const inSampleData = foldData.slice(0, inSampleSize);
    const outOfSampleData = foldData.slice(inSampleSize);
    
    // Run backtest on in-sample data
    if (inSampleData.length >= 50) {
      const inResult = runBacktestSimulation(inSampleData, strategy, initialCapital);
      inSamplePeriods.push({
        startDate: inSampleData[0].date,
        endDate: inSampleData[inSampleData.length - 1].date,
        returnPercent: inResult.totalReturnPercent,
        winRate: inResult.winRate,
        trades: inResult.totalTrades
      });
    }
    
    // Run backtest on out-of-sample data
    if (outOfSampleData.length >= 20) {
      const outResult = runBacktestSimulation(outOfSampleData, strategy, initialCapital);
      outOfSamplePeriods.push({
        startDate: outOfSampleData[0].date,
        endDate: outOfSampleData[outOfSampleData.length - 1].date,
        returnPercent: outResult.totalReturnPercent,
        winRate: outResult.winRate,
        trades: outResult.totalTrades
      });
    }
  }
  
  const inSampleAvgReturn = inSamplePeriods.length > 0 
    ? inSamplePeriods.reduce((sum, p) => sum + p.returnPercent, 0) / inSamplePeriods.length 
    : 0;
  const outOfSampleAvgReturn = outOfSamplePeriods.length > 0 
    ? outOfSamplePeriods.reduce((sum, p) => sum + p.returnPercent, 0) / outOfSamplePeriods.length 
    : 0;
  
  const robustnessRatio = inSampleAvgReturn !== 0 ? outOfSampleAvgReturn / inSampleAvgReturn : 0;
  
  return {
    inSamplePeriods,
    outOfSamplePeriods,
    inSampleAvgReturn: parseFloat(inSampleAvgReturn.toFixed(2)),
    outOfSampleAvgReturn: parseFloat(outOfSampleAvgReturn.toFixed(2)),
    robustnessRatio: parseFloat(robustnessRatio.toFixed(2)),
    isRobust: robustnessRatio >= 0.5 && outOfSampleAvgReturn > 0,
    totalFolds: inSamplePeriods.length
  };
}

function calculateIndicators(data: HistoricalDataPoint[], index: number): Record<string, number> {
  const indicators: Record<string, number> = {};
  const closes = data.slice(0, index + 1).map(d => d.close);
  
  indicators['price'] = closes[closes.length - 1];
  
  if (closes.length >= 20) {
    indicators['sma_20'] = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  }
  if (closes.length >= 50) {
    indicators['sma_50'] = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  }
  
  if (closes.length >= 12) {
    const multiplier = 2 / (12 + 1);
    let ema = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
    for (let i = 12; i < closes.length; i++) {
      ema = (closes[i] - ema) * multiplier + ema;
    }
    indicators['ema_12'] = ema;
  }
  
  if (closes.length >= 14) {
    const changes = [];
    for (let i = closes.length - 14; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }
    const gains = changes.filter(c => c > 0).reduce((a, b) => a + b, 0) / 14;
    const losses = Math.abs(changes.filter(c => c < 0).reduce((a, b) => a + b, 0)) / 14;
    const rs = losses === 0 ? 100 : gains / losses;
    indicators['rsi'] = 100 - (100 / (1 + rs));
  }
  
  if (closes.length >= 26) {
    const ema12 = indicators['ema_12'] || closes.slice(-12).reduce((a, b) => a + b, 0) / 12;
    const ema26 = closes.slice(-26).reduce((a, b) => a + b, 0) / 26;
    indicators['macd'] = ema12 - ema26;
  }
  
  if (closes.length >= 20) {
    const sma = indicators['sma_20'];
    const variance = closes.slice(-20).reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);
    indicators['bb_upper'] = sma + 2 * stdDev;
    indicators['bb_lower'] = sma - 2 * stdDev;
    indicators['bb_middle'] = sma;
  }
  
  indicators['volume'] = data[index].volume;
  
  return indicators;
}

function evaluateConditions(
  conditions: ConditionGroup[], 
  currentIndicators: Record<string, number>,
  previousIndicators: Record<string, number> | null
): boolean {
  if (conditions.length === 0) return false;
  
  let result = true;
  let isFirstCondition = true;
  
  for (const condition of conditions) {
    const indicatorValue = getIndicatorValue(condition.indicator, currentIndicators);
    const prevIndicatorValue = previousIndicators ? getIndicatorValue(condition.indicator, previousIndicators) : null;
    const targetValue = parseFloat(condition.value);
    
    let conditionMet = false;
    
    switch (condition.operator) {
      case 'crosses_above':
        if (prevIndicatorValue !== null) {
          conditionMet = prevIndicatorValue <= targetValue && indicatorValue > targetValue;
        }
        break;
      case 'crosses_below':
        if (prevIndicatorValue !== null) {
          conditionMet = prevIndicatorValue >= targetValue && indicatorValue < targetValue;
        }
        break;
      case 'above':
      case 'greater_than':
        conditionMet = indicatorValue > targetValue;
        break;
      case 'below':
      case 'less_than':
        conditionMet = indicatorValue < targetValue;
        break;
      case 'equals':
        conditionMet = Math.abs(indicatorValue - targetValue) < 0.01;
        break;
    }
    
    if (isFirstCondition) {
      result = conditionMet;
      isFirstCondition = false;
    } else {
      if (condition.logic === 'OR') {
        result = result || conditionMet;
      } else {
        result = result && conditionMet;
      }
    }
  }
  
  return result;
}

function getIndicatorValue(indicator: string, indicators: Record<string, number>): number {
  const mapping: Record<string, string> = {
    'rsi': 'rsi',
    'sma': 'sma_20',
    'ema': 'ema_12',
    'macd': 'macd',
    'price': 'price',
    'volume': 'volume',
    'bb': 'bb_middle'
  };
  
  return indicators[mapping[indicator] || indicator] || 0;
}

interface BacktestResult {
  finalCapital: number;
  totalReturnPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  avgTradeReturn: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  avgHoldingPeriod: string;
  trades: Trade[];
  equityCurve: EquityPoint[];
}

function runBacktestSimulation(
  data: HistoricalDataPoint[],
  strategy: BacktestParams['strategy'],
  initialCapital: number
): BacktestResult {
  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];
  
  let capital = initialCapital;
  let peakCapital = initialCapital;
  let maxDrawdown = 0;
  let position: { entryDate: string; entryPrice: number; quantity: number } | null = null;
  let previousIndicators: Record<string, number> | null = null;
  
  const returns: number[] = [];
  
  for (let i = 50; i < data.length; i++) {
    const currentData = data[i];
    const currentIndicators = calculateIndicators(data, i);
    
    if (!position && evaluateConditions(strategy.entry_conditions, currentIndicators, previousIndicators)) {
      const quantity = Math.floor(capital / currentData.close);
      if (quantity > 0) {
        position = {
          entryDate: currentData.date,
          entryPrice: currentData.close,
          quantity
        };
      }
    }
    
    if (position) {
      const pnlPercent = ((currentData.close - position.entryPrice) / position.entryPrice) * 100;
      
      let shouldExit = evaluateConditions(strategy.exit_conditions, currentIndicators, previousIndicators);
      
      if (strategy.stop_loss_percent && pnlPercent <= -strategy.stop_loss_percent) {
        shouldExit = true;
      }
      
      if (strategy.take_profit_percent && pnlPercent >= strategy.take_profit_percent) {
        shouldExit = true;
      }
      
      if (shouldExit) {
        const pnl = (currentData.close - position.entryPrice) * position.quantity;
        capital += pnl;
        
        trades.push({
          entryDate: position.entryDate,
          exitDate: currentData.date,
          entryPrice: position.entryPrice,
          exitPrice: currentData.close,
          direction: 'long',
          quantity: position.quantity,
          pnl,
          pnlPercent
        });
        
        returns.push(pnlPercent);
        position = null;
      }
    }
    
    const currentEquity = position 
      ? capital - (position.quantity * position.entryPrice) + (position.quantity * currentData.close)
      : capital;
    
    if (currentEquity > peakCapital) peakCapital = currentEquity;
    const drawdown = ((peakCapital - currentEquity) / peakCapital) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    
    if (i % 5 === 0) {
      equityCurve.push({
        date: currentData.date.split('T')[0],
        equity: parseFloat(currentEquity.toFixed(2)),
        drawdown: parseFloat(drawdown.toFixed(2))
      });
    }
    
    previousIndicators = currentIndicators;
  }
  
  if (position && data.length > 0) {
    const lastData = data[data.length - 1];
    const pnl = (lastData.close - position.entryPrice) * position.quantity;
    const pnlPercent = ((lastData.close - position.entryPrice) / position.entryPrice) * 100;
    capital += pnl;
    
    trades.push({
      entryDate: position.entryDate,
      exitDate: lastData.date,
      entryPrice: position.entryPrice,
      exitPrice: lastData.close,
      direction: 'long',
      quantity: position.quantity,
      pnl,
      pnlPercent
    });
    
    returns.push(pnlPercent);
  }
  
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl < 0);
  
  const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
  
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 0 
    ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length 
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev !== 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  
  const negativeReturns = returns.filter(r => r < 0);
  const downsideVariance = negativeReturns.length > 0 
    ? negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length 
    : 0;
  const downsideDeviation = Math.sqrt(downsideVariance);
  const sortinoRatio = downsideDeviation !== 0 ? (avgReturn / downsideDeviation) * Math.sqrt(252) : 0;
  
  const holdingPeriods = trades.map(t => {
    const entry = new Date(t.entryDate);
    const exit = new Date(t.exitDate);
    return (exit.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24);
  });
  const avgHoldingDays = holdingPeriods.length > 0 
    ? holdingPeriods.reduce((a, b) => a + b, 0) / holdingPeriods.length 
    : 0;
  
  return {
    finalCapital: parseFloat(capital.toFixed(2)),
    totalReturnPercent: parseFloat(((capital - initialCapital) / initialCapital * 100).toFixed(2)),
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: trades.length > 0 ? parseFloat((winningTrades.length / trades.length * 100).toFixed(2)) : 0,
    profitFactor: totalLosses !== 0 ? parseFloat((totalWins / totalLosses).toFixed(2)) : totalWins > 0 ? 999 : 0,
    maxDrawdownPercent: parseFloat(maxDrawdown.toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    sortinoRatio: parseFloat(sortinoRatio.toFixed(2)),
    avgTradeReturn: returns.length > 0 ? parseFloat(avgReturn.toFixed(2)) : 0,
    avgWin: winningTrades.length > 0 ? parseFloat((totalWins / winningTrades.length).toFixed(2)) : 0,
    avgLoss: losingTrades.length > 0 ? parseFloat((totalLosses / losingTrades.length).toFixed(2)) : 0,
    largestWin: winningTrades.length > 0 ? parseFloat(Math.max(...winningTrades.map(t => t.pnl)).toFixed(2)) : 0,
    largestLoss: losingTrades.length > 0 ? parseFloat(Math.abs(Math.min(...losingTrades.map(t => t.pnl))).toFixed(2)) : 0,
    avgHoldingPeriod: `${avgHoldingDays.toFixed(1)} days`,
    trades,
    equityCurve
  };
}