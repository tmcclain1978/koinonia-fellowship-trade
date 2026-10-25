/**
 * Weekly report card for Options Signals: how the predictions did in one
 * week (Monday to Sunday, New York time), what worked best and worst, and
 * a few plain notes so problems show up fast.
 */
import { etClock } from "../../../supabase/functions/_shared/bot/session";
import { etWallTimeToEpoch } from "../../../supabase/functions/_shared/candle-buckets";
import type { OptionSignal } from "./scanner";

const DAY = 86_400_000;

export interface ReportRow {
  key: string;
  label: string;
  /** Finished predictions (win, loss or expired). */
  n: number;
  wins: number;
  hitRate: number;
  /** Average random-entry rate for these predictions. */
  baseline: number;
  /** Sum of exit-plan results in R (stop distances). */
  planR: number;
}

export interface WeekReport {
  from: number;
  to: number;
  label: string;
  total: number;
  wins: number;
  losses: number;
  expired: number;
  open: number;
  hitRate: number;
  baseline: number;
  /** Estimated dollars per contract (target / stop estimates). */
  estPnl: number;
  planR: number;
  /** Real fill checks done this week. */
  fills: { n: number; realPnl: number; midPnl: number; estPnl: number; estN: number };
  /** Automatic paper trades closed this week. */
  paper: { n: number; pnl: number; wins: number };
  byPattern: ReportRow[];
  bySymbol: ReportRow[];
  byMode: ReportRow[];
  byDir: ReportRow[];
  best: ReportRow | null;
  worst: ReportRow | null;
  /** The week before, for comparison. */
  prev: { n: number; hitRate: number } | null;
  notes: string[];
}

/** Monday 00:00 ET of the week `t` falls in, moved by `weeksBack` weeks. */
export function weekStart(t: number, weeksBack = 0): number {
  const c = etClock(t);
  const noon = etWallTimeToEpoch(c.y, c.m, c.d, 12, 0);
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(c.weekday);
  const monNoon = noon - (dow < 0 ? 0 : dow) * DAY - weeksBack * 7 * DAY;
  const m = etClock(monNoon);
  return etWallTimeToEpoch(m.y, m.m, m.d, 0, 0);
}

/** The Monday after `from` (DST-safe). */
const weekEnd = (from: number) => {
  const m = etClock(from + 7 * DAY + 12 * 3600_000);
  return etWallTimeToEpoch(m.y, m.m, m.d, 0, 0);
};

const done = (s: OptionSignal) => s.outcome === "win" || s.outcome === "loss" || s.outcome === "expired";

function group(list: OptionSignal[], keyOf: (s: OptionSignal) => Array<[string, string]>): ReportRow[] {
  const m = new Map<string, ReportRow & { bsum: number }>();
  for (const s of list) {
    if (!done(s)) continue;
    for (const [key, label] of keyOf(s)) {
      const r = m.get(key) ?? { key, label, n: 0, wins: 0, hitRate: 0, baseline: 0, planR: 0, bsum: 0 };
      r.n++;
      if (s.outcome === "win") r.wins++;
      r.bsum += s.baseline;
      r.planR += s.planR ?? 0;
      m.set(key, r);
    }
  }
  return Array.from(m.values())
    .map(({ bsum, ...r }) => ({ ...r, hitRate: r.n ? r.wins / r.n : 0, baseline: r.n ? bsum / r.n : 0 }))
    .sort((a, b) => b.n - a.n || b.hitRate - a.hitRate);
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const usd = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(Math.round(n))}`;

export function weeklyReport(signals: OptionSignal[], from: number): WeekReport {
  const to = weekEnd(from);
  const list = signals.filter((s) => s.at >= from && s.at < to);
  const fin = list.filter(done);
  const wins = fin.filter((s) => s.outcome === "win").length;
  const losses = fin.filter((s) => s.outcome === "loss").length;
  const expired = fin.filter((s) => s.outcome === "expired").length;
  const hitRate = fin.length ? wins / fin.length : 0;
  const baseline = fin.length ? fin.reduce((a, s) => a + s.baseline, 0) / fin.length : 0;
  const estPnl = fin.reduce((a, s) => a + (!s.contract ? 0 : s.outcome === "win" ? s.contract.profitAtTarget : s.outcome === "loss" ? s.contract.lossAtStop : 0), 0);
  const planR = fin.reduce((a, s) => a + (s.planR ?? 0), 0);

  const withFill = list.filter((s) => s.fill && s.fill.realPnl !== null && s.fill.midPnl !== null);
  const withEst = withFill.filter((s) => s.fill!.estPnl !== null);
  const fills = {
    n: withFill.length,
    realPnl: withFill.reduce((a, s) => a + s.fill!.realPnl!, 0),
    midPnl: withFill.reduce((a, s) => a + s.fill!.midPnl!, 0),
    estN: withEst.length,
    estPnl: withEst.reduce((a, s) => a + s.fill!.estPnl!, 0),
  };
  const closedPaper = list.filter((s) => s.paper?.pnl !== undefined);
  const paper = { n: closedPaper.length, pnl: closedPaper.reduce((a, s) => a + s.paper!.pnl!, 0), wins: closedPaper.filter((s) => s.paper!.pnl! > 0).length };

  const byPattern = group(list, (s) => {
    const dirWord = s.dir === "up" ? "calls" : "puts";
    return Array.from(new Map(s.evidence.map((e) => [`${e.pattern}|${s.dir}`, `${e.name} ${dirWord}`])).entries());
  });
  const bySymbol = group(list, (s) => [[s.symbol, s.symbol]]);
  const byMode = group(list, (s) => [[s.mode, s.mode === "sameday" ? "Same day" : "Swing"]]);
  const byDir = group(list, (s) => [[s.dir, s.dir === "up" ? "Calls" : "Puts"]]);

  // Best / worst pattern: at least 2 results, ranked by how far above / below a random entry.
  const ranked = byPattern.filter((r) => r.n >= 2).sort((a, b) => b.hitRate - b.baseline - (a.hitRate - a.baseline) || b.n - a.n);
  const best = ranked.length && ranked[0].hitRate > ranked[0].baseline ? ranked[0] : null;
  const last = ranked[ranked.length - 1];
  const worst = last && last !== best && last.hitRate < last.baseline ? last : null;

  const prevFrom = weekStart(from + 12 * 3600_000, 1);
  const prevList = signals.filter((s) => s.at >= prevFrom && s.at < from && done(s));
  const prev = prevList.length ? { n: prevList.length, hitRate: prevList.filter((s) => s.outcome === "win").length / prevList.length } : null;

  const notes: string[] = [];
  if (!list.length) notes.push("No predictions this week.");
  else {
    if (fin.length) notes.push(`Hit the target first in ${wins} of ${fin.length} predictions (${pct(hitRate)}). A random entry would hit about ${pct(baseline)}. ${hitRate >= baseline + 0.05 ? "That's better than chance." : hitRate <= baseline - 0.05 ? "That's worse than chance." : "That's about the same as chance."}`);
    if (fin.length && fin.length < 10) notes.push(`Only ${fin.length} finished prediction${fin.length === 1 ? "" : "s"}: too few to judge on their own. Look at several weeks together.`);
    if (list.length > fin.length) notes.push(`${list.length - fin.length} still open.`);
    if (best) notes.push(`Best: ${best.label}, ${best.wins} of ${best.n} (${pct(best.hitRate)}).`);
    if (worst) notes.push(`Worst: ${worst.label}, ${worst.wins} of ${worst.n} (${pct(worst.hitRate)}). If it keeps losing, the app pauses it on its own after 10 results.`);
    const [calls, puts] = ["up", "down"].map((d) => byDir.find((r) => r.key === d));
    if (calls && puts && calls.n >= 3 && puts.n >= 3 && Math.abs(calls.hitRate - puts.hitRate) >= 0.15) {
      notes.push(`${calls.hitRate > puts.hitRate ? "Calls" : "Puts"} did much better (${pct(Math.max(calls.hitRate, puts.hitRate))} vs ${pct(Math.min(calls.hitRate, puts.hitRate))}).`);
    }
    for (const r of bySymbol) if (r.n >= 3 && r.wins === 0) notes.push(`Nothing worked on ${r.label} (0 of ${r.n}).`);
    if (prev && fin.length) {
      const d = hitRate - prev.hitRate;
      notes.push(Math.abs(d) < 0.05 ? `About the same as last week (${pct(prev.hitRate)}).` : `${d > 0 ? "Up" : "Down"} from ${pct(prev.hitRate)} last week.`);
    }
    if (fills.n) {
      const gap = (fills.midPnl - fills.realPnl) / fills.n;
      notes.push(`Real fills (${fills.n}): buying at the ask and selling at the bid made ${usd(fills.realPnl)}; the bid/ask gap cost about $${Math.round(gap)} per trade.`);
      if (fills.estN >= 3 && fills.realPnl < fills.estPnl - 25 * fills.estN) notes.push(`Real fills came in well below the app's estimates (${usd(fills.estPnl)} estimated). Same-day options may be costing more than they pay.`);
    }
    if (paper.n) notes.push(`Paper trades: ${paper.wins} of ${paper.n} made money, total ${usd(paper.pnl)}.`);
  }

  const fmt = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  return { from, to, label: `${fmt(from)} – ${fmt(to - DAY)}`, total: list.length, wins, losses, expired, open: list.length - fin.length, hitRate, baseline, estPnl, planR, fills, paper, byPattern, bySymbol, byMode, byDir, best, worst, prev, notes };
}

/** Plain text to copy or share. */
export function weeklyText(r: WeekReport): string {
  const rows = (title: string, list: ReportRow[]) => (list.length ? `\n${title}\n${list.map((x) => `  ${x.label}: ${x.wins} of ${x.n} (${pct(x.hitRate)})`).join("\n")}` : "");
  return `OPTIONS SIGNALS — WEEKLY REPORT CARD (${r.label})\n\n${r.wins} WIN · ${r.losses} LOSS · ${r.expired} EXPIRED${r.open ? ` · ${r.open} OPEN` : ""}\n${r.notes.map((n) => `• ${n}`).join("\n")}${rows("By stock", r.bySymbol)}${rows("By pattern", r.byPattern)}`;
}
