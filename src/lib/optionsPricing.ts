// Black-Scholes Option Pricing and Greeks Calculations

export interface OptionLeg {
  id: string;
  type: 'call' | 'put';
  strike: number;
  expiration: Date;
  quantity: number; // positive for long, negative for short
  premium: number; // price paid/received per share
  symbol: string;
}

export interface OptionGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface PnLPoint {
  price: number;
  intrinsicPnL: number;
  totalPnL: number;
  todayPnL: number;
}

// Standard normal cumulative distribution function
export function cumulativeNorm(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

// Standard normal probability density function
export function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Calculate d1 and d2 for Black-Scholes
function calculateD1D2(
  stockPrice: number,
  strike: number,
  rate: number,
  vol: number,
  time: number
): { d1: number; d2: number } {
  const d1 = (Math.log(stockPrice / strike) + (rate + 0.5 * vol * vol) * time) / (vol * Math.sqrt(time));
  const d2 = d1 - vol * Math.sqrt(time);
  return { d1, d2 };
}

// Black-Scholes option price
export function blackScholes(
  type: 'call' | 'put',
  stockPrice: number,
  strike: number,
  rate: number,
  vol: number,
  time: number
): number {
  if (time <= 0) {
    // At expiration, return intrinsic value
    return type === 'call' 
      ? Math.max(0, stockPrice - strike)
      : Math.max(0, strike - stockPrice);
  }

  const { d1, d2 } = calculateD1D2(stockPrice, strike, rate, vol, time);

  if (type === 'call') {
    return stockPrice * cumulativeNorm(d1) - strike * Math.exp(-rate * time) * cumulativeNorm(d2);
  } else {
    return strike * Math.exp(-rate * time) * cumulativeNorm(-d2) - stockPrice * cumulativeNorm(-d1);
  }
}

// Calculate intrinsic value
export function intrinsicValue(type: 'call' | 'put', stockPrice: number, strike: number): number {
  if (type === 'call') {
    return Math.max(0, stockPrice - strike);
  }
  return Math.max(0, strike - stockPrice);
}

// Calculate time value
export function timeValue(
  type: 'call' | 'put',
  stockPrice: number,
  strike: number,
  rate: number,
  vol: number,
  time: number
): number {
  const optionPrice = blackScholes(type, stockPrice, strike, rate, vol, time);
  const intrinsic = intrinsicValue(type, stockPrice, strike);
  return Math.max(0, optionPrice - intrinsic);
}

// Calculate Greeks
export function calculateGreeks(
  type: 'call' | 'put',
  stockPrice: number,
  strike: number,
  rate: number,
  vol: number,
  time: number
): OptionGreeks {
  if (time <= 0) {
    // At expiration, Greeks are essentially 0 or undefined
    return { delta: type === 'call' ? (stockPrice > strike ? 1 : 0) : (stockPrice < strike ? -1 : 0), 
             gamma: 0, theta: 0, vega: 0, rho: 0 };
  }

  const { d1, d2 } = calculateD1D2(stockPrice, strike, rate, vol, time);
  const sqrtTime = Math.sqrt(time);
  const expRT = Math.exp(-rate * time);
  const pdf_d1 = normalPDF(d1);

  let delta: number;
  let theta: number;
  let rho: number;

  if (type === 'call') {
    delta = cumulativeNorm(d1);
    theta = (-stockPrice * pdf_d1 * vol / (2 * sqrtTime)) - rate * strike * expRT * cumulativeNorm(d2);
    rho = strike * time * expRT * cumulativeNorm(d2);
  } else {
    delta = cumulativeNorm(d1) - 1;
    theta = (-stockPrice * pdf_d1 * vol / (2 * sqrtTime)) + rate * strike * expRT * cumulativeNorm(-d2);
    rho = -strike * time * expRT * cumulativeNorm(-d2);
  }

  const gamma = pdf_d1 / (stockPrice * vol * sqrtTime);
  const vega = stockPrice * pdf_d1 * sqrtTime;

  return {
    delta,
    gamma,
    theta: theta / 365, // Convert to daily theta
    vega: vega / 100,   // Convert to per 1% vol change
    rho: rho / 100      // Convert to per 1% rate change
  };
}

// Calculate P&L for a single option leg
export function optionPnL(
  leg: OptionLeg,
  stockPrice: number,
  currentOptionPrice: number
): number {
  const costBasis = leg.premium * Math.abs(leg.quantity) * 100;
  const currentValue = currentOptionPrice * Math.abs(leg.quantity) * 100;
  
  if (leg.quantity > 0) {
    // Long position: profit when option price increases
    return currentValue - costBasis;
  } else {
    // Short position: profit when option price decreases
    return costBasis - currentValue;
  }
}

// Calculate total P&L for multiple legs
export function totalPnL(
  legs: OptionLeg[],
  stockPrice: number,
  rate: number,
  vol: number,
  time: number
): number {
  return legs.reduce((sum, leg) => {
    const optionPrice = blackScholes(leg.type, stockPrice, leg.strike, rate, vol, time);
    return sum + optionPnL(leg, stockPrice, optionPrice);
  }, 0);
}

// Generate P&L curve data points
export function generatePnLCurve(
  legs: OptionLeg[],
  currentPrice: number,
  rate: number,
  vol: number,
  daysToExpiration: number,
  priceRange: number = 0.3, // +/- 30% of current price
  points: number = 100
): PnLPoint[] {
  const minPrice = currentPrice * (1 - priceRange);
  const maxPrice = currentPrice * (1 + priceRange);
  const step = (maxPrice - minPrice) / points;
  const timeYears = daysToExpiration / 365;

  const data: PnLPoint[] = [];

  for (let i = 0; i <= points; i++) {
    const price = minPrice + step * i;
    
    // Calculate intrinsic P&L (at expiration)
    let intrinsicPnL = 0;
    let todayPnL = 0;
    let totalPnLValue = 0;

    for (const leg of legs) {
      const intrinsic = intrinsicValue(leg.type, price, leg.strike);
      const costBasis = leg.premium * 100;
      
      if (leg.quantity > 0) {
        intrinsicPnL += (intrinsic - leg.premium) * leg.quantity * 100;
      } else {
        intrinsicPnL += (leg.premium - intrinsic) * Math.abs(leg.quantity) * 100;
      }

      // Today's P&L using current time value
      const todayPrice = blackScholes(leg.type, price, leg.strike, rate, vol, timeYears);
      const todayValue = todayPrice * Math.abs(leg.quantity) * 100;
      
      if (leg.quantity > 0) {
        todayPnL += todayValue - costBasis * Math.abs(leg.quantity);
      } else {
        todayPnL += costBasis * Math.abs(leg.quantity) - todayValue;
      }
    }

    data.push({
      price: parseFloat(price.toFixed(2)),
      intrinsicPnL: parseFloat(intrinsicPnL.toFixed(2)),
      totalPnL: parseFloat(intrinsicPnL.toFixed(2)), // At expiration
      todayPnL: parseFloat(todayPnL.toFixed(2))
    });
  }

  return data;
}

// Calculate aggregate Greeks for multi-leg position
export function aggregateGreeks(
  legs: OptionLeg[],
  stockPrice: number,
  rate: number,
  vol: number,
  time: number
): OptionGreeks {
  const aggregate: OptionGreeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };

  for (const leg of legs) {
    const greeks = calculateGreeks(leg.type, stockPrice, leg.strike, rate, vol, time);
    aggregate.delta += greeks.delta * leg.quantity * 100;
    aggregate.gamma += greeks.gamma * leg.quantity * 100;
    aggregate.theta += greeks.theta * leg.quantity * 100;
    aggregate.vega += greeks.vega * leg.quantity * 100;
    aggregate.rho += greeks.rho * leg.quantity * 100;
  }

  return aggregate;
}

// Find break-even prices
export function findBreakEvenPrices(
  legs: OptionLeg[],
  currentPrice: number,
  rate: number,
  vol: number,
  time: number
): number[] {
  const curve = generatePnLCurve(legs, currentPrice, rate, vol, time * 365);
  const breakEvens: number[] = [];

  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1];
    const curr = curve[i];
    
    // Check if P&L crosses zero
    if ((prev.intrinsicPnL <= 0 && curr.intrinsicPnL >= 0) ||
        (prev.intrinsicPnL >= 0 && curr.intrinsicPnL <= 0)) {
      // Linear interpolation
      const ratio = Math.abs(prev.intrinsicPnL) / (Math.abs(prev.intrinsicPnL) + Math.abs(curr.intrinsicPnL));
      const breakEven = prev.price + ratio * (curr.price - prev.price);
      breakEvens.push(parseFloat(breakEven.toFixed(2)));
    }
  }

  return breakEvens;
}

// Calculate max profit and max loss
export function calculateMaxProfitLoss(
  legs: OptionLeg[],
  currentPrice: number,
  rate: number,
  vol: number,
  time: number
): { maxProfit: number; maxLoss: number; maxProfitPrice: number; maxLossPrice: number } {
  const curve = generatePnLCurve(legs, currentPrice, rate, vol, time * 365, 0.5, 200);
  
  let maxProfit = -Infinity;
  let maxLoss = Infinity;
  let maxProfitPrice = currentPrice;
  let maxLossPrice = currentPrice;

  for (const point of curve) {
    if (point.intrinsicPnL > maxProfit) {
      maxProfit = point.intrinsicPnL;
      maxProfitPrice = point.price;
    }
    if (point.intrinsicPnL < maxLoss) {
      maxLoss = point.intrinsicPnL;
      maxLossPrice = point.price;
    }
  }

  return { maxProfit, maxLoss, maxProfitPrice, maxLossPrice };
}
