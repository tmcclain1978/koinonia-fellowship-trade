import { type Chart, LineType } from "klinecharts";

interface SessionDividerOptions {
  showMarketOpen: boolean;
  showMarketClose: boolean;
  showPremarketShading: boolean;
  showAfterHoursShading: boolean;
}

// Market hours in Eastern Time
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;
const MARKET_CLOSE_MINUTE = 0;
const PREMARKET_START_HOUR = 4;
const AFTER_HOURS_END_HOUR = 20;

// Convert a timestamp to Eastern Time components
function getEasternTimeComponents(timestamp: number): { 
  hour: number; 
  minute: number; 
  dayOfWeek: number;
  dateString: string;
} {
  const date = new Date(timestamp);
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  };
  
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
  const hourPart = parts.find(p => p.type === 'hour');
  const minutePart = parts.find(p => p.type === 'minute');
  const weekdayPart = parts.find(p => p.type === 'weekday');
  
  const hour = hourPart ? parseInt(hourPart.value) : 0;
  const minute = minutePart ? parseInt(minutePart.value) : 0;
  
  // Map weekday string to number (0 = Sun, 1 = Mon, etc.)
  const dayMap: Record<string, number> = {
    'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
  };
  const dayOfWeek = weekdayPart ? (dayMap[weekdayPart.value] ?? 0) : 0;
  
  // Get date string for grouping
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateString = dateFormatter.format(date);
  
  return { hour, minute, dayOfWeek, dateString };
}

// Check if a time is during premarket hours (4:00 AM - 9:30 AM ET)
function isPremarketTime(hour: number, minute: number): boolean {
  const timeInMinutes = hour * 60 + minute;
  const premarketStart = PREMARKET_START_HOUR * 60;
  const marketOpen = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
  return timeInMinutes >= premarketStart && timeInMinutes < marketOpen;
}

// Check if a time is during after-hours (4:00 PM - 8:00 PM ET)
function isAfterHoursTime(hour: number, minute: number): boolean {
  const timeInMinutes = hour * 60 + minute;
  const marketClose = MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE;
  const afterHoursEnd = AFTER_HOURS_END_HOUR * 60;
  return timeInMinutes >= marketClose && timeInMinutes < afterHoursEnd;
}

// Check if close to market open (within 5 minutes for intraday, same candle for hourly)
function isNearMarketOpen(hour: number, minute: number, intervalMinutes: number): boolean {
  const marketOpenMinutes = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
  const currentMinutes = hour * 60 + minute;
  const tolerance = Math.max(intervalMinutes, 5); // At least 5 min tolerance
  return Math.abs(currentMinutes - marketOpenMinutes) < tolerance;
}

// Check if close to market close
function isNearMarketClose(hour: number, minute: number, intervalMinutes: number): boolean {
  const marketCloseMinutes = MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE;
  const currentMinutes = hour * 60 + minute;
  const tolerance = Math.max(intervalMinutes, 5);
  return Math.abs(currentMinutes - marketCloseMinutes) < tolerance;
}

// Get interval in minutes from interval string
function getIntervalMinutes(interval: string): number {
  const map: Record<string, number> = {
    '1': 1, '1m': 1, 'minute': 1,
    '5': 5, '5m': 5, '5minute': 5,
    '15': 15, '15m': 15, '15minute': 15,
    '30': 30, '30m': 30, '30minute': 30,
    '60': 60, '1h': 60, 'hour': 60,
    '240': 240, '4h': 240,
    'D': 1440, '1D': 1440, 'daily': 1440,
    'W': 10080, '1W': 10080, 'weekly': 10080,
  };
  return map[interval] || 5;
}

// Identify session boundaries from candle data
export function identifySessionBoundaries(
  candles: { timestamp: number }[],
  interval: string
): {
  marketOpenTimestamps: number[];
  marketCloseTimestamps: number[];
  premarketRanges: { start: number; end: number }[];
  afterHoursRanges: { start: number; end: number }[];
} {
  const intervalMinutes = getIntervalMinutes(interval);
  
  // Skip session dividers for daily or higher timeframes
  if (intervalMinutes >= 1440) {
    return {
      marketOpenTimestamps: [],
      marketCloseTimestamps: [],
      premarketRanges: [],
      afterHoursRanges: [],
    };
  }
  
  const marketOpenTimestamps: number[] = [];
  const marketCloseTimestamps: number[] = [];
  const premarketRanges: { start: number; end: number }[] = [];
  const afterHoursRanges: { start: number; end: number }[] = [];
  
  // Track seen dates to avoid duplicates
  const seenMarketOpenDates = new Set<string>();
  const seenMarketCloseDates = new Set<string>();
  
  // Track current extended hours range
  let currentPremarketStart: number | null = null;
  let currentAfterHoursStart: number | null = null;
  
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const { hour, minute, dayOfWeek, dateString } = getEasternTimeComponents(candle.timestamp);
    
    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    
    // Detect market open
    if (isNearMarketOpen(hour, minute, intervalMinutes) && !seenMarketOpenDates.has(dateString)) {
      marketOpenTimestamps.push(candle.timestamp);
      seenMarketOpenDates.add(dateString);
      
      // End premarket range if we were tracking one
      if (currentPremarketStart !== null) {
        premarketRanges.push({ start: currentPremarketStart, end: candle.timestamp });
        currentPremarketStart = null;
      }
    }
    
    // Detect market close
    if (isNearMarketClose(hour, minute, intervalMinutes) && !seenMarketCloseDates.has(dateString)) {
      marketCloseTimestamps.push(candle.timestamp);
      seenMarketCloseDates.add(dateString);
    }
    
    // Track premarket ranges
    if (isPremarketTime(hour, minute)) {
      if (currentPremarketStart === null) {
        currentPremarketStart = candle.timestamp;
      }
    } else if (currentPremarketStart !== null && !isPremarketTime(hour, minute)) {
      premarketRanges.push({ start: currentPremarketStart, end: candle.timestamp });
      currentPremarketStart = null;
    }
    
    // Track after-hours ranges
    if (isAfterHoursTime(hour, minute)) {
      if (currentAfterHoursStart === null) {
        currentAfterHoursStart = candle.timestamp;
      }
    } else if (currentAfterHoursStart !== null && !isAfterHoursTime(hour, minute)) {
      afterHoursRanges.push({ start: currentAfterHoursStart, end: candle.timestamp });
      currentAfterHoursStart = null;
    }
  }
  
  // Close any open ranges at the end
  if (currentPremarketStart !== null && candles.length > 0) {
    premarketRanges.push({ start: currentPremarketStart, end: candles[candles.length - 1].timestamp });
  }
  if (currentAfterHoursStart !== null && candles.length > 0) {
    afterHoursRanges.push({ start: currentAfterHoursStart, end: candles[candles.length - 1].timestamp });
  }
  
  return {
    marketOpenTimestamps,
    marketCloseTimestamps,
    premarketRanges,
    afterHoursRanges,
  };
}

// Apply session dividers to the chart
export const SESSION_DIVIDER_GROUP = "session-dividers";

export function applySessionDividers(
  chart: Chart | null,
  candles: { timestamp: number; open: number; high: number; low: number; close: number }[],
  interval: string,
  options: SessionDividerOptions = {
    showMarketOpen: true,
    showMarketClose: true,
    showPremarketShading: true,
    showAfterHoursShading: true,
  }
): void {
  if (!chart || candles.length === 0) return;

  // Replace, don't stack: earlier dividers are removed before drawing new ones.
  chart.removeOverlay({ groupId: SESSION_DIVIDER_GROUP });

  const boundaries = identifySessionBoundaries(candles, interval);
  
  // Calculate price range for shading
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  candles.forEach(c => {
    minPrice = Math.min(minPrice, c.low);
    maxPrice = Math.max(maxPrice, c.high);
  });
  
  // Add some padding
  const padding = (maxPrice - minPrice) * 0.1;
  minPrice -= padding;
  maxPrice += padding;
  
  // Market Open lines - Green dashed vertical lines
  if (options.showMarketOpen) {
    boundaries.marketOpenTimestamps.forEach((timestamp) => {
      chart.createOverlay({
        groupId: SESSION_DIVIDER_GROUP,
        name: "verticalStraightLine",
        points: [{ timestamp }],
        styles: {
          line: {
            color: 'rgba(34, 197, 94, 0.6)',
            size: 1.5,
            style: LineType.Dashed,
          }
        },
        extendData: '🔔 Open'
      });
    });
  }
  
  // Market Close lines - Red dashed vertical lines
  if (options.showMarketClose) {
    boundaries.marketCloseTimestamps.forEach((timestamp) => {
      chart.createOverlay({
        groupId: SESSION_DIVIDER_GROUP,
        name: "verticalStraightLine",
        points: [{ timestamp }],
        styles: {
          line: {
            color: 'rgba(239, 68, 68, 0.6)',
            size: 1.5,
            style: LineType.Dashed,
          }
        },
        extendData: '🔕 Close'
      });
    });
  }
  
  // Premarket shading - Light blue/cyan tint using horizontal lines at top/bottom
  // Note: klinecharts doesn't support filled rectangles directly, so we use subtle horizontal lines
  if (options.showPremarketShading && boundaries.premarketRanges.length > 0) {
    boundaries.premarketRanges.forEach((range) => {
      // Add a subtle line at the start of premarket
      chart.createOverlay({
        groupId: SESSION_DIVIDER_GROUP,
        name: "verticalStraightLine",
        points: [{ timestamp: range.start }],
        styles: {
          line: {
            color: 'rgba(59, 130, 246, 0.3)',
            size: 1,
            style: LineType.Dashed,
          }
        },
        extendData: 'PM'
      });
    });
  }
  
  // After-hours shading - Light orange/amber tint
  if (options.showAfterHoursShading && boundaries.afterHoursRanges.length > 0) {
    boundaries.afterHoursRanges.forEach((range) => {
      // Add a subtle line at the start of after-hours
      chart.createOverlay({
        groupId: SESSION_DIVIDER_GROUP,
        name: "verticalStraightLine",
        points: [{ timestamp: range.start }],
        styles: {
          line: {
            color: 'rgba(251, 191, 36, 0.3)',
            size: 1,
            style: LineType.Dashed,
          }
        },
        extendData: 'AH'
      });
    });
  }
}

// Remove all session dividers (other overlays are untouched).
export function clearSessionDividers(chart: Chart | null): void {
  chart?.removeOverlay({ groupId: SESSION_DIVIDER_GROUP });
}

export type { SessionDividerOptions };
