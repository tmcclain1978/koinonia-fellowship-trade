import { CandlestickData } from 'lightweight-charts';

export interface IndicatorData {
  time: number;
  value: number;
}

// Simple Moving Average
export const calculateSMA = (data: CandlestickData[], period: number): IndicatorData[] => {
  const result: IndicatorData[] = [];
  
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += (data[i - j].close as number);
    }
    result.push({
      time: data[i].time as number,
      value: sum / period,
    });
  }
  
  return result;
};

// Exponential Moving Average
export const calculateEMA = (data: CandlestickData[], period: number): IndicatorData[] => {
  const result: IndicatorData[] = [];
  const multiplier = 2 / (period + 1);
  
  // Start with SMA
  let ema = 0;
  for (let i = 0; i < period; i++) {
    ema += (data[i].close as number);
  }
  ema = ema / period;
  
  result.push({
    time: data[period - 1].time as number,
    value: ema,
  });
  
  // Calculate EMA
  for (let i = period; i < data.length; i++) {
    ema = ((data[i].close as number) - ema) * multiplier + ema;
    result.push({
      time: data[i].time as number,
      value: ema,
    });
  }
  
  return result;
};

// Relative Strength Index
export const calculateRSI = (data: CandlestickData[], period: number = 14): IndicatorData[] => {
  const result: IndicatorData[] = [];
  let gains = 0;
  let losses = 0;
  
  // Calculate initial average gain and loss
  for (let i = 1; i <= period; i++) {
    const change = (data[i].close as number) - (data[i - 1].close as number);
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  // Calculate RSI
  for (let i = period; i < data.length; i++) {
    const change = (data[i].close as number) - (data[i - 1].close as number);
    
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - change) / period;
    }
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    result.push({
      time: data[i].time as number,
      value: rsi,
    });
  }
  
  return result;
};

// MACD
export const calculateMACD = (
  data: CandlestickData[], 
  fastPeriod: number = 12, 
  slowPeriod: number = 26, 
  signalPeriod: number = 9
) => {
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);
  
  const macdLine: IndicatorData[] = [];
  const startIndex = slowPeriod - fastPeriod;
  
  for (let i = 0; i < slowEMA.length; i++) {
    macdLine.push({
      time: slowEMA[i].time,
      value: fastEMA[i + startIndex].value - slowEMA[i].value,
    });
  }
  
  const signalLine = calculateEMA(
    macdLine.map(d => ({ time: d.time, close: d.value } as CandlestickData)),
    signalPeriod
  );
  
  const histogram: IndicatorData[] = [];
  for (let i = signalPeriod - 1; i < macdLine.length; i++) {
    histogram.push({
      time: macdLine[i].time,
      value: macdLine[i].value - signalLine[i - (signalPeriod - 1)].value,
    });
  }
  
  return { macdLine, signalLine, histogram };
};

// Bollinger Bands
export const calculateBollingerBands = (
  data: CandlestickData[], 
  period: number = 20, 
  stdDev: number = 2
) => {
  const sma = calculateSMA(data, period);
  const upper: IndicatorData[] = [];
  const lower: IndicatorData[] = [];
  
  for (let i = 0; i < sma.length; i++) {
    const dataIndex = i + period - 1;
    let sumSquares = 0;
    
    for (let j = 0; j < period; j++) {
      const diff = (data[dataIndex - j].close as number) - sma[i].value;
      sumSquares += diff * diff;
    }
    
    const stdDeviation = Math.sqrt(sumSquares / period);
    
    upper.push({
      time: sma[i].time,
      value: sma[i].value + (stdDev * stdDeviation),
    });
    
    lower.push({
      time: sma[i].time,
      value: sma[i].value - (stdDev * stdDeviation),
    });
  }
  
  return { upper, middle: sma, lower };
};

// Average True Range
export const calculateATR = (data: CandlestickData[], period: number = 14): IndicatorData[] => {
  const result: IndicatorData[] = [];
  const trueRanges: number[] = [];
  
  // Calculate True Range for each period
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high as number;
    const low = data[i].low as number;
    const prevClose = data[i - 1].close as number;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    
    trueRanges.push(tr);
  }
  
  // Calculate initial ATR (SMA of TR)
  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += trueRanges[i];
  }
  atr = atr / period;
  
  result.push({
    time: data[period].time as number,
    value: atr,
  });
  
  // Calculate subsequent ATR values (smoothed)
  for (let i = period; i < trueRanges.length; i++) {
    atr = ((atr * (period - 1)) + trueRanges[i]) / period;
    result.push({
      time: data[i + 1].time as number,
      value: atr,
    });
  }
  
  return result;
};
