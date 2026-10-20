/**
 * Market clock for the bot, in New York time. Pure.
 *
 * Holidays and 1:00 pm early closes come from the NYSE calendar
 * (nyse.com/markets/hours-calendars). Extend the tables each year; on an
 * unknown year the bot still knows weekends and normal hours.
 */
import { etWallTimeToEpoch } from "../candle-buckets.ts";

const HOLIDAYS = new Set([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19",
  "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18",
  "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
  // 2028
  "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29", "2028-06-19", "2028-07-04",
  "2028-09-04", "2028-11-23", "2028-12-25",
]);

/** Days the market closes at 1:00 pm ET. */
const EARLY_CLOSES = new Set(["2026-11-27", "2026-12-24", "2027-11-26", "2028-07-03", "2028-11-24"]);

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
});

export interface EtClock {
  /** YYYY-MM-DD in New York. */
  date: string;
  /** Minutes since midnight in New York. */
  minute: number;
  weekday: string;
  y: number;
  m: number;
  d: number;
}

export function etClock(ts: number): EtClock {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const y = +p.year, m = +p.month, d = +p.day;
  return { date: `${p.year}-${p.month}-${p.day}`, minute: (+p.hour % 24) * 60 + +p.minute, weekday: p.weekday, y, m, d };
}

export const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;
const EARLY_CLOSE_MIN = 13 * 60;

export interface SessionTimes {
  isTradingDay: boolean;
  /** Minutes since midnight ET. */
  open: number;
  close: number;
}

export function sessionFor(ts: number): SessionTimes {
  const c = etClock(ts);
  const weekend = c.weekday === "Sat" || c.weekday === "Sun";
  const isTradingDay = !weekend && !HOLIDAYS.has(c.date);
  return { isTradingDay, open: OPEN_MIN, close: EARLY_CLOSES.has(c.date) ? EARLY_CLOSE_MIN : CLOSE_MIN };
}

export interface BotWindows {
  /** No new entries before this many minutes after the open. */
  skipOpenMinutes: number;
  /** No new entries in the last N minutes before the close. */
  noEntryLastMinutes: number;
  /** Close everything this many minutes before the close. */
  flattenBeforeCloseMinutes: number;
}

export const DEFAULT_WINDOWS: BotWindows = { skipOpenMinutes: 15, noEntryLastMinutes: 60, flattenBeforeCloseMinutes: 10 };

export type Phase = "closed" | "opening" | "entries" | "manage_only" | "flatten";

/**
 * What the bot may do right now:
 *  - closed: market closed (nothing to do)
 *  - opening: first minutes after the open (manage only, no entries)
 *  - entries: normal trading (manage + new entries)
 *  - manage_only: last hour (manage, no new entries)
 *  - flatten: close every position now
 */
export function botPhase(ts: number, w: BotWindows = DEFAULT_WINDOWS): Phase {
  const s = sessionFor(ts);
  if (!s.isTradingDay) return "closed";
  const { minute } = etClock(ts);
  if (minute < s.open || minute >= s.close) return "closed";
  if (minute >= s.close - w.flattenBeforeCloseMinutes) return "flatten";
  if (minute < s.open + w.skipOpenMinutes) return "opening";
  if (minute >= s.close - w.noEntryLastMinutes) return "manage_only";
  return "entries";
}

/** Epoch ms of the session open/close on the New York day containing ts. */
export function sessionBounds(ts: number) {
  const c = etClock(ts);
  const s = sessionFor(ts);
  return {
    open: etWallTimeToEpoch(c.y, c.m, c.d, Math.floor(s.open / 60), s.open % 60),
    close: etWallTimeToEpoch(c.y, c.m, c.d, Math.floor(s.close / 60), s.close % 60),
  };
}

/** The previous `n` trading days' dates (YYYY-MM-DD), most recent first, not including ts's day. */
export function previousTradingDays(ts: number, n: number): string[] {
  const out: string[] = [];
  const c = etClock(ts);
  let t = etWallTimeToEpoch(c.y, c.m, c.d, 12, 0); // noon: stepping by 24h never skips a date across DST
  for (let i = 0; i < 30 && out.length < n; i++) {
    t -= 86_400_000;
    if (sessionFor(t).isTradingDay) out.push(etClock(t).date);
  }
  return out;
}
