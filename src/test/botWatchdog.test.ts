import { describe, it, expect } from "vitest";
import { watchdogFindings, type WatchdogInput } from "../../supabase/functions/_shared/bot/watchdog";
import { et } from "./botFixtures";

const at = (h: number, m: number) => et("2026-10-21", h, m);
const base: WatchdogInput = {
  now: at(11, 0), phase: "entries", sessionOpenAt: at(9, 30), botEnabled: true, mode: "paper",
  lastRunAt: new Date(at(10, 59)).toISOString(), activeTrades: 0, errorTrades: [], schwab: { issuedAt: new Date(at(9, 0)).toISOString(), working: true },
};

describe("watchdog", () => {
  it("quiet when everything is fine", () => {
    expect(watchdogFindings(base)).toEqual([]);
  });

  it("warns when the bot hasn't run for 4+ minutes in the session; email only for live", () => {
    const stale = { ...base, lastRunAt: new Date(at(10, 50)).toISOString() };
    expect(watchdogFindings(stale)).toMatchObject([{ title: "Trading bot isn't running", email: false }]);
    const live = watchdogFindings({ ...stale, mode: "live", activeTrades: 2 });
    expect(live[0]).toMatchObject({ title: "Trading bot (LIVE) isn't running", email: true });
    expect(live[0].message).toMatch(/2 open trades/);
  });

  it("no false alarm right after the open, after hours, or with the bot off and nothing open", () => {
    const yesterday = new Date(at(9, 0) - 86_400_000).toISOString();
    expect(watchdogFindings({ ...base, now: at(9, 33), lastRunAt: yesterday })).toEqual([]);
    expect(watchdogFindings({ ...base, phase: "closed", lastRunAt: yesterday })).toEqual([]);
    expect(watchdogFindings({ ...base, botEnabled: false, lastRunAt: yesterday })).toEqual([]);
    // Bot off but a trade still open: still needs runs.
    expect(watchdogFindings({ ...base, botEnabled: false, activeTrades: 1, lastRunAt: yesterday })).toHaveLength(1);
  });

  it("flags trades the bot stopped managing", () => {
    const f = watchdogFindings({ ...base, errorTrades: [{ symbol: "AAPL", mode: "live", note: "broker shows 0 shares, bot expected 40" }] });
    expect(f[0]).toMatchObject({ title: "Bot trade in AAPL needs you", email: true });
  });

  it("Schwab login: warns in the last 36 hours, and when it has expired", () => {
    const sixDays = new Date(base.now - 6 * 86_400_000).toISOString();
    expect(watchdogFindings({ ...base, schwab: { issuedAt: sixDays, working: true } })[0]).toMatchObject({ title: "Schwab login expires soon" });
    expect(watchdogFindings({ ...base, schwab: { issuedAt: sixDays, working: true } })[0].message).toMatch(/about 24 hours/);
    expect(watchdogFindings({ ...base, schwab: { issuedAt: null, working: false }, mode: "live" })[0]).toMatchObject({ title: "Schwab login expired", email: true });
    expect(watchdogFindings({ ...base, schwab: null })).toEqual([]);
  });

  it("each finding dedupes by title so the changing details don't cause repeats", () => {
    const f = watchdogFindings({ ...base, lastRunAt: null, errorTrades: [{ symbol: "X", mode: "paper", note: null }], schwab: { issuedAt: null, working: false } });
    expect(f.length).toBe(3);
    expect(f.every((x) => x.dedupeBy === "title" && x.dedupeMinutes >= 60)).toBe(true);
  });
});
