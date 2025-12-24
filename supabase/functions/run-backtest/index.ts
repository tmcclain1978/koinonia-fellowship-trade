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

    // Generate simulated historical data for backtesting
    // In production, this would fetch real historical data from a market data API
    const historicalData = generateHistoricalData(params.symbol, params.startDate, params.endDate, params.timeframe);
    
    console.log(`Generated ${historicalData.length} data points for ${params.symbol}`);

    // Run the backtest simulation
    const result = runBacktestSimulation(
      historicalData,
      params.strategy,
      params.initialCapital
    );

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
      JSON.stringify({ success: true, result: savedResult }),
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

interface HistoricalDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function generateHistoricalData(
  symbol: string, 
  startDate: string, 
  endDate: string, 
  timeframe: string
): HistoricalDataPoint[] {
  const data: HistoricalDataPoint[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Base price based on symbol (simulated)
  let basePrice = symbol === 'AAPL' ? 150 : 
                  symbol === 'MSFT' ? 350 : 
                  symbol === 'GOOGL' ? 140 :
                  symbol === 'TSLA' ? 250 :
                  symbol === 'AMZN' ? 175 : 100;
  
  let currentPrice = basePrice;
  const volatility = 0.02; // 2% daily volatility
  
  // Determine interval based on timeframe
  const intervalMs = timeframe === '1m' ? 60000 :
                     timeframe === '5m' ? 300000 :
                     timeframe === '15m' ? 900000 :
                     timeframe === '1h' ? 3600000 :
                     timeframe === '4h' ? 14400000 :
                     timeframe === '1D' ? 86400000 :
                     timeframe === '1W' ? 604800000 : 86400000;

  let currentDate = new Date(start);
  
  while (currentDate <= end) {
    // Skip weekends for daily+ data
    if (timeframe === '1D' || timeframe === '1W') {
      const day = currentDate.getDay();
      if (day === 0 || day === 6) {
        currentDate = new Date(currentDate.getTime() + intervalMs);
        continue;
      }
    }
    
    // Generate OHLCV data with some randomness and trend
    const trend = Math.sin(data.length / 50) * 0.001; // Slight sinusoidal trend
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

function calculateIndicators(data: HistoricalDataPoint[], index: number): Record<string, number> {
  const indicators: Record<string, number> = {};
  const closes = data.slice(0, index + 1).map(d => d.close);
  
  // Price
  indicators['price'] = closes[closes.length - 1];
  
  // SMA calculations
  if (closes.length >= 20) {
    indicators['sma_20'] = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  }
  if (closes.length >= 50) {
    indicators['sma_50'] = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  }
  
  // EMA calculation (simplified)
  if (closes.length >= 12) {
    const multiplier = 2 / (12 + 1);
    let ema = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
    for (let i = 12; i < closes.length; i++) {
      ema = (closes[i] - ema) * multiplier + ema;
    }
    indicators['ema_12'] = ema;
  }
  
  // RSI calculation
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
  
  // MACD (simplified)
  if (closes.length >= 26) {
    const ema12 = indicators['ema_12'] || closes.slice(-12).reduce((a, b) => a + b, 0) / 12;
    const ema26 = closes.slice(-26).reduce((a, b) => a + b, 0) / 26;
    indicators['macd'] = ema12 - ema26;
  }
  
  // Bollinger Bands
  if (closes.length >= 20) {
    const sma = indicators['sma_20'];
    const variance = closes.slice(-20).reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);
    indicators['bb_upper'] = sma + 2 * stdDev;
    indicators['bb_lower'] = sma - 2 * stdDev;
    indicators['bb_middle'] = sma;
  }
  
  // Volume
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
  // Map indicator names to calculated values
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
  
  // Process each data point
  for (let i = 50; i < data.length; i++) { // Start after enough data for indicators
    const currentData = data[i];
    const currentIndicators = calculateIndicators(data, i);
    
    // Check for entry
    if (!position && evaluateConditions(strategy.entry_conditions, currentIndicators, previousIndicators)) {
      const quantity = Math.floor(capital / currentData.close);
      if (quantity > 0) {
        position = {
          entryDate: currentData.date,
          entryPrice: currentData.close,
          quantity
        };
        console.log(`Entry at ${currentData.date}: $${currentData.close}`);
      }
    }
    
    // Check for exit or stop loss / take profit
    if (position) {
      const pnlPercent = ((currentData.close - position.entryPrice) / position.entryPrice) * 100;
      
      let shouldExit = evaluateConditions(strategy.exit_conditions, currentIndicators, previousIndicators);
      
      // Check stop loss
      if (strategy.stop_loss_percent && pnlPercent <= -strategy.stop_loss_percent) {
        shouldExit = true;
        console.log(`Stop loss triggered at ${currentData.date}`);
      }
      
      // Check take profit
      if (strategy.take_profit_percent && pnlPercent >= strategy.take_profit_percent) {
        shouldExit = true;
        console.log(`Take profit triggered at ${currentData.date}`);
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
        console.log(`Exit at ${currentData.date}: $${currentData.close}, P&L: $${pnl.toFixed(2)}`);
      }
    }
    
    // Update equity curve
    const currentEquity = position 
      ? capital - (position.quantity * position.entryPrice) + (position.quantity * currentData.close)
      : capital;
    
    if (currentEquity > peakCapital) peakCapital = currentEquity;
    const drawdown = ((peakCapital - currentEquity) / peakCapital) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    
    // Sample equity curve (every 5 points to reduce data size)
    if (i % 5 === 0) {
      equityCurve.push({
        date: currentData.date.split('T')[0],
        equity: parseFloat(currentEquity.toFixed(2)),
        drawdown: parseFloat(drawdown.toFixed(2))
      });
    }
    
    previousIndicators = currentIndicators;
  }
  
  // Close any open position at the end
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
  
  // Calculate statistics
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl < 0);
  
  const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
  
  // Calculate Sharpe Ratio (annualized, assuming daily returns)
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 0 
    ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length 
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev !== 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  
  // Calculate Sortino Ratio (using downside deviation)
  const negativeReturns = returns.filter(r => r < 0);
  const downsideVariance = negativeReturns.length > 0 
    ? negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length 
    : 0;
  const downsideDeviation = Math.sqrt(downsideVariance);
  const sortinoRatio = downsideDeviation !== 0 ? (avgReturn / downsideDeviation) * Math.sqrt(252) : 0;
  
  // Calculate average holding period
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