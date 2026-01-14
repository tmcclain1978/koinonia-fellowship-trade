import { Chart, LineType } from "klinecharts";

// Fibonacci retracement levels
export const FIBONACCI_LEVELS = [
  { level: 0, label: '0%', color: '#6b7280' },
  { level: 0.236, label: '23.6%', color: '#3b82f6' },
  { level: 0.382, label: '38.2%', color: '#8b5cf6' },
  { level: 0.5, label: '50%', color: '#f59e0b' },
  { level: 0.618, label: '61.8%', color: '#22c55e' },
  { level: 0.786, label: '78.6%', color: '#ec4899' },
  { level: 1, label: '100%', color: '#6b7280' },
];

// Extended Fibonacci levels for projections
export const FIBONACCI_EXTENSIONS = [
  { level: 1.272, label: '127.2%', color: '#14b8a6' },
  { level: 1.618, label: '161.8%', color: '#f97316' },
  { level: 2.0, label: '200%', color: '#ef4444' },
  { level: 2.618, label: '261.8%', color: '#dc2626' },
];

export interface FibonacciLevel {
  price: number;
  level: number;
  label: string;
  color: string;
}

export interface FibonacciRetracement {
  id: string;
  symbol: string;
  highPrice: number;
  lowPrice: number;
  isUptrend: boolean; // true if measuring from low to high (retracement down), false if high to low
  levels: FibonacciLevel[];
  createdAt: string;
}

// Calculate Fibonacci retracement levels between two price points
export function calculateFibonacciLevels(
  highPrice: number,
  lowPrice: number,
  isUptrend: boolean = true,
  includeExtensions: boolean = false
): FibonacciLevel[] {
  const priceRange = highPrice - lowPrice;
  const allLevels = includeExtensions 
    ? [...FIBONACCI_LEVELS, ...FIBONACCI_EXTENSIONS]
    : FIBONACCI_LEVELS;

  return allLevels.map(fib => {
    // For uptrend: levels go from high to low (retracement down from high)
    // For downtrend: levels go from low to high (retracement up from low)
    const price = isUptrend
      ? highPrice - (priceRange * fib.level)
      : lowPrice + (priceRange * fib.level);

    return {
      price,
      level: fib.level,
      label: fib.label,
      color: fib.color,
    };
  });
}

// Generate unique ID for Fibonacci drawing
export function generateFibonacciId(): string {
  return `fib_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Create Fibonacci retracement object
export function createFibonacciRetracement(
  symbol: string,
  highPrice: number,
  lowPrice: number,
  isUptrend: boolean = true,
  includeExtensions: boolean = false
): FibonacciRetracement {
  return {
    id: generateFibonacciId(),
    symbol: symbol.toUpperCase(),
    highPrice,
    lowPrice,
    isUptrend,
    levels: calculateFibonacciLevels(highPrice, lowPrice, isUptrend, includeExtensions),
    createdAt: new Date().toISOString(),
  };
}

// Apply Fibonacci retracement to chart
export function applyFibonacciToChart(
  chart: Chart | null,
  retracement: FibonacciRetracement
): string[] {
  if (!chart) return [];

  const overlayIds: string[] = [];

  // Clear existing Fibonacci overlays for this retracement
  clearFibonacciOverlays(chart, retracement.id);

  retracement.levels.forEach((level, index) => {
    try {
      const overlayId = chart.createOverlay({
        name: 'horizontalStraightLine',
        id: `fib_${retracement.id}_${index}`,
        points: [{ value: level.price }],
        styles: {
          line: {
            color: level.color,
            size: level.level === 0.5 || level.level === 0.618 ? 2 : 1,
            style: level.level === 0 || level.level === 1 ? LineType.Solid : LineType.Dashed,
          },
        },
        extendData: `Fib ${level.label}: $${level.price.toFixed(2)}`,
      });

      if (overlayId) {
        overlayIds.push(typeof overlayId === 'string' ? overlayId : String(overlayId));
      }
    } catch (e) {
      console.warn('Failed to create Fibonacci overlay:', e);
    }
  });

  return overlayIds;
}

// Clear Fibonacci overlays from chart
export function clearFibonacciOverlays(chart: Chart | null, retracementId?: string): void {
  if (!chart) return;

  try {
    if (retracementId) {
      // Clear specific retracement
      FIBONACCI_LEVELS.concat(FIBONACCI_EXTENSIONS).forEach((_, index) => {
        chart.removeOverlay({ id: `fib_${retracementId}_${index}` });
      });
    } else {
      // Clear all Fibonacci overlays by attempting to remove common patterns
      // This is a fallback - ideally track IDs
      for (let i = 0; i < 20; i++) {
        chart.removeOverlay({ id: `fib_active_${i}` });
      }
    }
  } catch (e) {
    console.warn('Failed to clear Fibonacci overlays:', e);
  }
}

// Storage key for Fibonacci drawings
const FIBONACCI_STORAGE_KEY = 'chart-fibonacci-drawings';

// Get stored Fibonacci drawings
export function getStoredFibonacciDrawings(): FibonacciRetracement[] {
  try {
    const stored = localStorage.getItem(FIBONACCI_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.warn('Failed to load Fibonacci drawings:', e);
    return [];
  }
}

// Get Fibonacci drawings for a symbol
export function getFibonacciForSymbol(symbol: string): FibonacciRetracement[] {
  return getStoredFibonacciDrawings().filter(
    f => f.symbol.toUpperCase() === symbol.toUpperCase()
  );
}

// Save Fibonacci drawing
export function saveFibonacciDrawing(retracement: FibonacciRetracement): void {
  const drawings = getStoredFibonacciDrawings();
  const existingIndex = drawings.findIndex(d => d.id === retracement.id);

  if (existingIndex >= 0) {
    drawings[existingIndex] = retracement;
  } else {
    drawings.push(retracement);
  }

  try {
    localStorage.setItem(FIBONACCI_STORAGE_KEY, JSON.stringify(drawings));
  } catch (e) {
    console.warn('Failed to save Fibonacci drawing:', e);
  }
}

// Delete Fibonacci drawing
export function deleteFibonacciDrawing(retracementId: string): void {
  const drawings = getStoredFibonacciDrawings().filter(d => d.id !== retracementId);

  try {
    localStorage.setItem(FIBONACCI_STORAGE_KEY, JSON.stringify(drawings));
  } catch (e) {
    console.warn('Failed to delete Fibonacci drawing:', e);
  }
}

// Delete all Fibonacci drawings for a symbol
export function deleteAllFibonacciForSymbol(symbol: string): void {
  const drawings = getStoredFibonacciDrawings().filter(
    d => d.symbol.toUpperCase() !== symbol.toUpperCase()
  );

  try {
    localStorage.setItem(FIBONACCI_STORAGE_KEY, JSON.stringify(drawings));
  } catch (e) {
    console.warn('Failed to delete Fibonacci drawings:', e);
  }
}

// Apply all stored Fibonacci drawings for a symbol
export function applyStoredFibonacciToChart(chart: Chart | null, symbol: string): void {
  if (!chart) return;

  const drawings = getFibonacciForSymbol(symbol);
  drawings.forEach(drawing => {
    applyFibonacciToChart(chart, drawing);
  });
}

// Auto-detect swing high and low for Fibonacci
export function detectSwingPoints(
  candles: Array<{ high: number; low: number; timestamp: number }>,
  lookback: number = 20
): { high: { price: number; index: number }; low: { price: number; index: number } } | null {
  if (candles.length < lookback) return null;

  const recentCandles = candles.slice(-lookback);
  
  let highestPrice = -Infinity;
  let highestIndex = 0;
  let lowestPrice = Infinity;
  let lowestIndex = 0;

  recentCandles.forEach((candle, index) => {
    if (candle.high > highestPrice) {
      highestPrice = candle.high;
      highestIndex = index;
    }
    if (candle.low < lowestPrice) {
      lowestPrice = candle.low;
      lowestIndex = index;
    }
  });

  return {
    high: { price: highestPrice, index: highestIndex },
    low: { price: lowestPrice, index: lowestIndex },
  };
}
