// QuantStats-style Portfolio Analytics Library
// Recreates Python QuantStats functionality in TypeScript

export interface PortfolioReturns {
  dates: Date[];
  returns: number[];
  prices?: number[];
}

export interface QuantMetrics {
  cagr: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  volatility: number;
  annualizedVolatility: number;
  var95: number;
  var99: number;
  cvar95: number;
  skewness: number;
  kurtosis: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  bestDay: number;
  worstDay: number;
  mtdReturn: number;
  ytdReturn: number;
  totalReturn: number;
  beta?: number;
  alpha?: number;
}

export interface DrawdownPeriod {
  start: Date;
  end: Date | null;
  trough: Date;
  drawdown: number;
  duration: number;
  recovery: number | null;
}

export interface MonthlyReturns {
  year: number;
  month: number;
  return: number;
}

// Calculate Compound Annual Growth Rate
export function calculateCAGR(returns: number[], periods: number = 252): number {
  if (returns.length === 0) return 0;
  
  const totalReturn = returns.reduce((acc, r) => acc * (1 + r), 1);
  const years = returns.length / periods;
  
  if (years <= 0) return 0;
  return Math.pow(totalReturn, 1 / years) - 1;
}

// Calculate rolling returns
export function calculateRollingReturns(returns: number[], window: number): number[] {
  const rolling: number[] = [];
  for (let i = window - 1; i < returns.length; i++) {
    const windowReturns = returns.slice(i - window + 1, i + 1);
    const cumReturn = windowReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
    rolling.push(cumReturn);
  }
  return rolling;
}

// Calculate standard deviation (volatility)
export function calculateVolatility(returns: number[]): number {
  if (returns.length === 0) return 0;
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;
  
  return Math.sqrt(variance);
}

// Calculate annualized volatility
export function calculateAnnualizedVolatility(returns: number[], periods: number = 252): number {
  return calculateVolatility(returns) * Math.sqrt(periods);
}

// Calculate Sharpe Ratio
export function calculateSharpeRatio(returns: number[], riskFreeRate: number = 0.05, periods: number = 252): number {
  if (returns.length === 0) return 0;
  
  const annualizedReturn = calculateCAGR(returns, periods);
  const annualizedVol = calculateAnnualizedVolatility(returns, periods);
  
  if (annualizedVol === 0) return 0;
  return (annualizedReturn - riskFreeRate) / annualizedVol;
}

// Calculate Sortino Ratio (downside deviation)
export function calculateSortinoRatio(returns: number[], riskFreeRate: number = 0.05, periods: number = 252): number {
  if (returns.length === 0) return 0;
  
  const negativeReturns = returns.filter(r => r < 0);
  const downsideDeviation = calculateVolatility(negativeReturns) * Math.sqrt(periods);
  
  if (downsideDeviation === 0) return 0;
  
  const annualizedReturn = calculateCAGR(returns, periods);
  return (annualizedReturn - riskFreeRate) / downsideDeviation;
}

// Calculate Maximum Drawdown
export function calculateMaxDrawdown(returns: number[]): { maxDD: number; periods: DrawdownPeriod[] } {
  if (returns.length === 0) return { maxDD: 0, periods: [] };
  
  const equity = [1];
  for (const r of returns) {
    equity.push(equity[equity.length - 1] * (1 + r));
  }
  
  let peak = equity[0];
  let maxDD = 0;
  const drawdowns: number[] = [];
  
  for (const value of equity) {
    if (value > peak) peak = value;
    const dd = (peak - value) / peak;
    drawdowns.push(dd);
    if (dd > maxDD) maxDD = dd;
  }
  
  // Find drawdown periods (simplified)
  const periods: DrawdownPeriod[] = [];
  
  return { maxDD, periods };
}

// Calculate Value at Risk
export function calculateVaR(returns: number[], confidence: number = 0.95): number {
  if (returns.length === 0) return 0;
  
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * sorted.length);
  
  return -sorted[Math.max(0, index)];
}

// Calculate Conditional VaR (Expected Shortfall)
export function calculateCVaR(returns: number[], confidence: number = 0.95): number {
  if (returns.length === 0) return 0;
  
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * sorted.length);
  
  const tailReturns = sorted.slice(0, Math.max(1, index));
  const avgTailLoss = tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length;
  
  return -avgTailLoss;
}

// Calculate Calmar Ratio
export function calculateCalmarRatio(returns: number[], periods: number = 252): number {
  const { maxDD } = calculateMaxDrawdown(returns);
  if (maxDD === 0) return 0;
  
  const cagr = calculateCAGR(returns, periods);
  return cagr / maxDD;
}

// Calculate skewness
export function calculateSkewness(returns: number[]): number {
  if (returns.length < 3) return 0;
  
  const n = returns.length;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const std = calculateVolatility(returns);
  
  if (std === 0) return 0;
  
  const cubedDiffs = returns.map(r => Math.pow((r - mean) / std, 3));
  return (n / ((n - 1) * (n - 2))) * cubedDiffs.reduce((a, b) => a + b, 0);
}

// Calculate kurtosis
export function calculateKurtosis(returns: number[]): number {
  if (returns.length < 4) return 0;
  
  const n = returns.length;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const std = calculateVolatility(returns);
  
  if (std === 0) return 0;
  
  const fourthPowerDiffs = returns.map(r => Math.pow((r - mean) / std, 4));
  const excess = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) * 
                 fourthPowerDiffs.reduce((a, b) => a + b, 0) -
                 (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
  
  return excess;
}

// Calculate win rate and profit factor
export function calculateTradeMetrics(returns: number[]): {
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
} {
  const wins = returns.filter(r => r > 0);
  const losses = returns.filter(r => r < 0);
  
  const winRate = returns.length > 0 ? wins.length / returns.length : 0;
  
  const totalWins = wins.reduce((a, b) => a + b, 0);
  const totalLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
  
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
  
  const avgWin = wins.length > 0 ? totalWins / wins.length : 0;
  const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;
  
  const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);
  
  return { winRate, profitFactor, avgWin, avgLoss, expectancy };
}

// Calculate Beta and Alpha against benchmark
export function calculateBetaAlpha(
  portfolioReturns: number[], 
  benchmarkReturns: number[],
  riskFreeRate: number = 0.05,
  periods: number = 252
): { beta: number; alpha: number } {
  if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length === 0) {
    return { beta: 0, alpha: 0 };
  }
  
  const n = portfolioReturns.length;
  const portfolioMean = portfolioReturns.reduce((a, b) => a + b, 0) / n;
  const benchmarkMean = benchmarkReturns.reduce((a, b) => a + b, 0) / n;
  
  let covariance = 0;
  let benchmarkVariance = 0;
  
  for (let i = 0; i < n; i++) {
    const pDiff = portfolioReturns[i] - portfolioMean;
    const bDiff = benchmarkReturns[i] - benchmarkMean;
    covariance += pDiff * bDiff;
    benchmarkVariance += bDiff * bDiff;
  }
  
  covariance /= n;
  benchmarkVariance /= n;
  
  const beta = benchmarkVariance > 0 ? covariance / benchmarkVariance : 0;
  
  const portfolioAnnualized = calculateCAGR(portfolioReturns, periods);
  const benchmarkAnnualized = calculateCAGR(benchmarkReturns, periods);
  
  const alpha = portfolioAnnualized - (riskFreeRate + beta * (benchmarkAnnualized - riskFreeRate));
  
  return { beta, alpha };
}

// Generate monthly returns heatmap data
export function generateMonthlyReturns(dates: Date[], returns: number[]): MonthlyReturns[] {
  const monthly: Map<string, number[]> = new Map();
  
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    
    if (!monthly.has(key)) {
      monthly.set(key, []);
    }
    monthly.get(key)!.push(returns[i]);
  }
  
  const result: MonthlyReturns[] = [];
  
  monthly.forEach((monthReturns, key) => {
    const [year, month] = key.split('-').map(Number);
    const cumReturn = monthReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
    result.push({ year, month, return: cumReturn });
  });
  
  return result.sort((a, b) => a.year - b.year || a.month - b.month);
}

// Calculate all metrics
export function calculateAllMetrics(
  returns: number[],
  dates?: Date[],
  benchmarkReturns?: number[],
  riskFreeRate: number = 0.05,
  periods: number = 252
): QuantMetrics {
  const tradeMetrics = calculateTradeMetrics(returns);
  const { maxDD } = calculateMaxDrawdown(returns);
  
  const totalReturn = returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
  
  // Calculate MTD/YTD (simplified with dates)
  const now = new Date();
  let mtdReturn = 0;
  let ytdReturn = 0;
  
  if (dates && dates.length === returns.length) {
    const mtdReturns = returns.filter((_, i) => {
      const d = dates[i];
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    mtdReturn = mtdReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
    
    const ytdReturns = returns.filter((_, i) => dates[i].getFullYear() === now.getFullYear());
    ytdReturn = ytdReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
  }
  
  let beta: number | undefined;
  let alpha: number | undefined;
  
  if (benchmarkReturns) {
    const ba = calculateBetaAlpha(returns, benchmarkReturns, riskFreeRate, periods);
    beta = ba.beta;
    alpha = ba.alpha;
  }
  
  return {
    cagr: calculateCAGR(returns, periods),
    sharpeRatio: calculateSharpeRatio(returns, riskFreeRate, periods),
    sortinoRatio: calculateSortinoRatio(returns, riskFreeRate, periods),
    calmarRatio: calculateCalmarRatio(returns, periods),
    maxDrawdown: maxDD,
    maxDrawdownDuration: 0, // Simplified
    volatility: calculateVolatility(returns),
    annualizedVolatility: calculateAnnualizedVolatility(returns, periods),
    var95: calculateVaR(returns, 0.95),
    var99: calculateVaR(returns, 0.99),
    cvar95: calculateCVaR(returns, 0.95),
    skewness: calculateSkewness(returns),
    kurtosis: calculateKurtosis(returns),
    winRate: tradeMetrics.winRate,
    profitFactor: tradeMetrics.profitFactor,
    expectancy: tradeMetrics.expectancy,
    avgWin: tradeMetrics.avgWin,
    avgLoss: tradeMetrics.avgLoss,
    bestDay: Math.max(...returns, 0),
    worstDay: Math.min(...returns, 0),
    mtdReturn,
    ytdReturn,
    totalReturn,
    beta,
    alpha,
  };
}

// Monte Carlo Simulation
export interface MonteCarloResult {
  paths: number[][];
  percentiles: {
    p5: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p95: number[];
  };
  finalValues: number[];
  probabilityOfProfit: number;
  probabilityOfTarget: number;
  expectedValue: number;
  worstCase: number;
  bestCase: number;
}

export function runMonteCarloSimulation(
  returns: number[],
  initialValue: number,
  numSimulations: number = 1000,
  horizon: number = 252,
  targetReturn: number = 0.1
): MonteCarloResult {
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const std = calculateVolatility(returns);
  
  const paths: number[][] = [];
  const finalValues: number[] = [];
  
  for (let sim = 0; sim < numSimulations; sim++) {
    const path = [initialValue];
    
    for (let day = 0; day < horizon; day++) {
      // Generate random return using Box-Muller transform
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const dailyReturn = mean + std * z;
      
      path.push(path[path.length - 1] * (1 + dailyReturn));
    }
    
    paths.push(path);
    finalValues.push(path[path.length - 1]);
  }
  
  // Calculate percentiles for each day
  const percentiles = {
    p5: [] as number[],
    p25: [] as number[],
    p50: [] as number[],
    p75: [] as number[],
    p95: [] as number[],
  };
  
  for (let day = 0; day <= horizon; day++) {
    const dayValues = paths.map(p => p[day]).sort((a, b) => a - b);
    percentiles.p5.push(dayValues[Math.floor(0.05 * dayValues.length)]);
    percentiles.p25.push(dayValues[Math.floor(0.25 * dayValues.length)]);
    percentiles.p50.push(dayValues[Math.floor(0.5 * dayValues.length)]);
    percentiles.p75.push(dayValues[Math.floor(0.75 * dayValues.length)]);
    percentiles.p95.push(dayValues[Math.floor(0.95 * dayValues.length)]);
  }
  
  const sortedFinal = [...finalValues].sort((a, b) => a - b);
  const targetValue = initialValue * (1 + targetReturn);
  
  return {
    paths,
    percentiles,
    finalValues,
    probabilityOfProfit: finalValues.filter(v => v > initialValue).length / numSimulations,
    probabilityOfTarget: finalValues.filter(v => v > targetValue).length / numSimulations,
    expectedValue: finalValues.reduce((a, b) => a + b, 0) / numSimulations,
    worstCase: sortedFinal[0],
    bestCase: sortedFinal[sortedFinal.length - 1],
  };
}
