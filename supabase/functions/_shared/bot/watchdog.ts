/**
 * What the watchdog should tell a user. Pure, tested.
 */
import type { Phase } from "./session.ts";

export interface WatchdogInput {
  now: number;
  phase: Phase;
  /** Epoch ms of today's open (runs are only expected a few minutes after it). */
  sessionOpenAt: number;
  botEnabled: boolean;
  mode: "paper" | "live";
  lastRunAt: string | null;
  activeTrades: number;
  errorTrades: Array<{ symbol: string; mode: string; note: string | null }>;
  /** null = no Schwab login at all. */
  schwab: { issuedAt: string | null; working: boolean } | null;
}

export interface Finding {
  type: "risk_warning" | "system";
  title: string;
  message: string;
  email: boolean;
  dedupeMinutes: number;
  dedupeBy: "title";
}

const STALE_MS = 4 * 60_000;
const SCHWAB_LIFE_MS = 7 * 86_400_000;
const WARN_BEFORE_MS = 36 * 3_600_000;

export function watchdogFindings(i: WatchdogInput): Finding[] {
  const out: Finding[] = [];
  const live = i.mode === "live";
  const needsRuns = (i.botEnabled || i.activeTrades > 0) && i.phase !== "closed" && i.now - i.sessionOpenAt > 5 * 60_000;
  const last = i.lastRunAt ? Date.parse(i.lastRunAt) : 0;
  if (needsRuns && i.now - last > STALE_MS) {
    const ago = last ? `${Math.round((i.now - last) / 60_000)} minutes ago` : "never";
    out.push({
      type: "risk_warning",
      title: live ? "Trading bot (LIVE) isn't running" : "Trading bot isn't running",
      message: `The bot last ran ${ago}${i.activeTrades ? ` and has ${i.activeTrades} open trade${i.activeTrades === 1 ? "" : "s"}` : ""}. ${live ? "Your Robinhood stop orders still protect open positions. " : ""}Check the bot page, or ask your developer to check the bot-engine schedule and CRON_SECRET.`,
      email: live,
      dedupeMinutes: 60,
      dedupeBy: "title",
    });
  }
  for (const t of i.errorTrades) {
    out.push({
      type: "risk_warning",
      title: `Bot trade in ${t.symbol} needs you`,
      message: `The bot stopped managing this ${t.mode === "live" ? "LIVE " : ""}trade on purpose: ${t.note ?? "see the bot log"}. Check the position in your ${t.mode === "live" ? "Robinhood" : "paper"} account and close it by hand if needed.`,
      email: t.mode === "live",
      dedupeMinutes: 24 * 60,
      dedupeBy: "title",
    });
  }
  if (i.schwab) {
    const affectsLive = live && i.botEnabled;
    if (!i.schwab.working) {
      out.push({
        type: "risk_warning",
        title: "Schwab login expired",
        message: `Reconnect Schwab in Settings. Until then charts and quotes fall back to delayed data${affectsLive ? ", and the bot won't open new live trades" : ""}.`,
        email: affectsLive,
        dedupeMinutes: 12 * 60,
        dedupeBy: "title",
      });
    } else if (i.schwab.issuedAt) {
      const left = Date.parse(i.schwab.issuedAt) + SCHWAB_LIFE_MS - i.now;
      if (left > 0 && left < WARN_BEFORE_MS) {
        const hours = Math.max(1, Math.round(left / 3_600_000));
        out.push({
          type: "system",
          title: "Schwab login expires soon",
          message: `Schwab logins last 7 days; yours ends in about ${hours} hour${hours === 1 ? "" : "s"}. Reconnect Schwab in Settings to keep real-time prices${affectsLive ? " (the bot needs them for live trades)" : ""}.`,
          email: affectsLive,
          dedupeMinutes: 12 * 60,
          dedupeBy: "title",
        });
      }
    }
  }
  return out;
}
