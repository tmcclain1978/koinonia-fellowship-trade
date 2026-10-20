/**
 * Session-aware candle bucketing for US equities (New York time).
 *
 * Shared by the browser chart (live candle roll-over) and the candle edge
 * function (building 1H/4H bars from 30-minute data), so both agree on where a
 * bar starts. Dependency-free so it runs in Deno and Vite.
 *
 * Rules (match TradingView for US stocks):
 *  - 1–30 minute bars: aligned to the clock (:00, :05, :15, :30 ...).
 *  - 1H and 4H bars: anchored to the 9:30 ET open (9:30, 10:30 ... / 9:30, 13:30).
 *  - Daily: the New York calendar day. Weekly: Monday of the week. Monthly: the 1st.
 */

const MIN = 60_000;

const INTERVAL_MINUTES: Record<string, number> = {
  '1': 1, '1m': 1, minute: 1, '1min': 1,
  '5': 5, '5m': 5, '5minute': 5, '5min': 5,
  '15': 15, '15m': 15, '15minute': 15, '15min': 15,
  '30': 30, '30m': 30, '30minute': 30, '30min': 30,
  '60': 60, '1h': 60, hour: 60, '60min': 60,
  '240': 240, '4h': 240,
};

export type IntervalKind = 'intraday' | 'day' | 'week' | 'month';

export function intervalKind(interval: string): IntervalKind {
  if (['D', '1D', 'daily', 'day'].includes(interval)) return 'day';
  if (['W', '1W', 'weekly', 'week'].includes(interval)) return 'week';
  if (['M', '1M', 'monthly', 'month'].includes(interval)) return 'month';
  return 'intraday';
}

/** Interval length in minutes for intraday intervals; null for D/W/M. */
export function intervalMinutes(interval: string): number | null {
  return INTERVAL_MINUTES[interval] ?? null;
}

/** Nominal interval length in ms (D/W/M are approximate; use only for spacing). */
export function getIntervalMs(interval: string): number {
  const m = intervalMinutes(interval);
  if (m) return m * MIN;
  switch (intervalKind(interval)) {
    case 'day': return 1440 * MIN;
    case 'week': return 7 * 1440 * MIN;
    case 'month': return 30 * 1440 * MIN;
    default: return 5 * MIN;
  }
}

const etParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});

interface EtTime { y: number; mo: number; d: number; h: number; mi: number; s: number }

function toEt(ts: number): EtTime {
  const p: Record<string, number> = {};
  for (const part of etParts.formatToParts(new Date(ts))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { y: p.year, mo: p.month, d: p.day, h: p.hour === 24 ? 0 : p.hour, mi: p.minute, s: p.second };
}

/** Epoch ms of a wall-clock time in New York (handles DST). */
export function etWallTimeToEpoch(y: number, mo: number, d: number, h = 0, mi = 0): number {
  // Start from the UTC reading of the wall time, then correct by the actual ET offset.
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const et = toEt(guess);
  const asIfUtc = Date.UTC(et.y, et.mo - 1, et.d, et.h, et.mi);
  const offset = asIfUtc - guess; // ET minus UTC (negative)
  let result = guess - offset;
  // Re-check once in case the offset differs at the corrected instant (DST edges).
  const et2 = toEt(result);
  const asIfUtc2 = Date.UTC(et2.y, et2.mo - 1, et2.d, et2.h, et2.mi);
  const drift = asIfUtc2 - Date.UTC(y, mo - 1, d, h, mi);
  if (drift !== 0) result -= drift;
  return result;
}

/**
 * Parse a US/Eastern wall-clock string with no offset ("2026-10-19 10:30:00" or
 * "2026-10-19"), as Alpha Vantage returns, into epoch ms. `new Date()` would
 * treat it as UTC and shift bars by 4-5 hours.
 */
export function parseEasternDateTime(s: string): number {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return new Date(s).getTime();
  return etWallTimeToEpoch(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
}

const SESSION_OPEN_MIN = 9 * 60 + 30;
const SESSION_CLOSE_MIN = 16 * 60;

/**
 * True during the regular US equity session (9:30–16:00 ET, Monday–Friday).
 * Market holidays are not checked; on a holiday no quotes arrive anyway.
 */
export function isRegularSessionTime(ts: number): boolean {
  const et = toEt(ts);
  const dow = new Date(Date.UTC(et.y, et.mo - 1, et.d)).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const minute = et.h * 60 + et.mi;
  return minute >= SESSION_OPEN_MIN && minute < SESSION_CLOSE_MIN;
}

/** Start (epoch ms) of the candle that contains `ts` for this interval. */
export function getBucketStart(ts: number, interval: string): number {
  const kind = intervalKind(interval);
  const et = toEt(ts);
  if (kind === 'day') return etWallTimeToEpoch(et.y, et.mo, et.d);
  if (kind === 'month') return etWallTimeToEpoch(et.y, et.mo, 1);
  if (kind === 'week') {
    // Weeks run Monday–Friday. A Sunday belongs to the week that starts the next
    // day (providers often stamp weekly bars on the Sunday the week begins).
    const sun0 = new Date(Date.UTC(et.y, et.mo - 1, et.d)).getUTCDay(); // Sunday = 0
    const daysSinceMonday = sun0 === 0 ? -1 : sun0 - 1;
    const monday = new Date(Date.UTC(et.y, et.mo - 1, et.d - daysSinceMonday));
    return etWallTimeToEpoch(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
  }
  const len = intervalMinutes(interval) ?? 5;
  const minuteOfDay = et.h * 60 + et.mi;
  const anchor = len >= 60 ? SESSION_OPEN_MIN : 0;
  const startMin = anchor + Math.floor((minuteOfDay - anchor) / len) * len;
  const midnight = etWallTimeToEpoch(et.y, et.mo, et.d);
  // startMin can be negative for pre-anchor times (e.g. 4H bar 05:30 the night before is not
  // meaningful); clamp to midnight so a bar never starts on the previous calendar day.
  return midnight + Math.max(startMin, 0) * MIN;
}

export interface Candle {
  time?: number; // seconds (edge function format)
  timestamp?: number; // ms (chart format)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Combine finer candles into `interval` buckets. Input may use `time` in
 * seconds or `timestamp` in ms; the output uses the same field the input used.
 */
export function aggregateCandles<T extends Candle>(candles: T[], interval: string): T[] {
  const out: T[] = [];
  let cur: T | null = null;
  let curKey = NaN;
  const usesSeconds = candles.length > 0 && candles[0].time !== undefined;
  for (const c of candles) {
    const ms = usesSeconds ? (c.time as number) * 1000 : (c.timestamp as number);
    const key = getBucketStart(ms, interval);
    if (cur && key === curKey) {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume || 0;
      continue;
    }
    if (cur) out.push(cur);
    curKey = key;
    cur = {
      ...c,
      ...(usesSeconds ? { time: Math.floor(key / 1000) } : { timestamp: key }),
      volume: c.volume || 0,
    };
  }
  if (cur) out.push(cur);
  return out;
}
