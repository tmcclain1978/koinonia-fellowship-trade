/**
 * Days and times to stay out, because moves come from news, not patterns:
 *
 *   Big US economic news (CPI, jobs report, Fed decisions, ...): no new
 *   same-day trades from 30 minutes before to 60 minutes after. On a Fed
 *   decision day, none after 1:30 pm ET (the decision and press conference).
 *
 *   Earnings: options are pricey before a report and lose that extra value
 *   right after it ("IV crush"), and the stock can gap past any stop.
 *     same day: no trades in the first session after the report
 *               (report before the open -> that day; after the close -> the next day)
 *     swing:    no trade whose window includes the report; the option
 *               picked should expire before it when possible
 */
import { etClock } from "../bot/session.ts";

export interface EconEvent {
  /** ISO time (UTC). */
  at: string;
  country: string;
  event: string;
  importance: "high" | "medium" | "low";
}

export interface EarningsDate {
  symbol: string;
  date: string;
  time: "bmo" | "amc" | null;
}

const isFed = (e: EconEvent) => /fomc|fed(eral)? (funds|interest rate)|interest rate decision/i.test(e.event);

/** Big US events only. */
export const bigUsEvents = (events: EconEvent[]) => events.filter((e) => e.importance === "high" && /^(US|USA|United States)$/i.test(e.country));

/** Reason a new same-day trade at time `t` should wait, or null. */
export function newsBlock(t: number, events: EconEvent[]): string | null {
  const day = etClock(t).date;
  for (const e of bigUsEvents(events)) {
    const at = Date.parse(e.at);
    if (!Number.isFinite(at)) continue;
    if (t >= at - 30 * 60_000 && t <= at + 60 * 60_000) return `${e.event} at ${new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`;
    if (isFed(e) && etClock(at).date === day) {
      const c = etClock(t);
      if (c.minute >= 13 * 60 + 30) return `Fed decision day (${e.event})`;
    }
  }
  return null;
}

/** The trading day after `date` (weekends skipped). */
function nextWeekday(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while ([0, 6].includes(d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}

/** Reason to skip a same-day trade in `symbol` at `t` because of earnings, or null. */
export function earningsBlockSameDay(symbol: string, t: number, earnings: EarningsDate[]): string | null {
  const day = etClock(t).date;
  for (const e of earnings) {
    if (e.symbol !== symbol) continue;
    const reaction = e.time === "bmo" ? [e.date] : e.time === "amc" ? [nextWeekday(e.date)] : [e.date, nextWeekday(e.date)];
    if (reaction.includes(day)) return `${symbol} just reported earnings (${e.date}${e.time ? ` ${e.time === "bmo" ? "before the open" : "after the close"}` : ""})`;
  }
  return null;
}

/** Reason to skip a swing trade in `symbol` from `from` to `until` (ms), or null. */
export function earningsBlockSwing(symbol: string, from: number, until: number, earnings: EarningsDate[]): string | null {
  const a = etClock(from).date;
  const b = etClock(until).date;
  for (const e of earnings) {
    if (e.symbol !== symbol) continue;
    if (e.date >= a && e.date <= b) return `${symbol} reports earnings on ${e.date}, inside this trade's window`;
  }
  return null;
}

/** The next earnings date for `symbol` on or after `t` (YYYY-MM-DD), if known. */
export function nextEarnings(symbol: string, t: number, earnings: EarningsDate[]): string | null {
  const day = etClock(t).date;
  return earnings.filter((e) => e.symbol === symbol && e.date >= day).map((e) => e.date).sort()[0] ?? null;
}

