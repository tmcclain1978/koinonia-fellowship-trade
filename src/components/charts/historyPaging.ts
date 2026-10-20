/**
 * Loading older candles when the user scrolls to the left edge.
 */
import type { KLineData } from "klinecharts";
import { intervalKind, intervalMinutes } from "./candleBuckets";

const DAY = 86_400_000;

const etDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
export const toEtDateString = (ts: number) => etDate.format(new Date(ts));

/** How far back one page reaches, in calendar days (null = don't page). */
export function pageSpanDays(interval: string): number | null {
  const kind = intervalKind(interval);
  if (kind === "day") return 730;
  if (kind === "week") return 3650;
  if (kind === "month") return null;
  const m = intervalMinutes(interval) ?? 5;
  if (m <= 1) return 5;
  if (m <= 15) return 20;
  return 120; // 30m, 1H, 4H (30-minute source bars; stays under provider limits)
}

/** Date range (New York dates, inclusive) for the page before `oldestTs`. */
export function olderRange(oldestTs: number, interval: string): { startDate: string; endDate: string } | null {
  const span = pageSpanDays(interval);
  if (!span || !Number.isFinite(oldestTs)) return null;
  return { startDate: toEtDateString(oldestTs - span * DAY), endDate: toEtDateString(oldestTs) };
}

/** Keep only candles strictly older than what's already loaded, sorted and de-duplicated. */
export function olderCandlesOnly(fetched: KLineData[], oldestTs: number): KLineData[] {
  const seen = new Set<number>();
  return fetched
    .filter((c) => c.timestamp < oldestTs)
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter((c) => (seen.has(c.timestamp) ? false : (seen.add(c.timestamp), true)));
}
