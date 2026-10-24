/**
 * Options signals for a few stocks (TSLA, SPY, AAPL, NVDA, QQQ):
 *
 *   same day: every 5-minute close during market hours, looks for patterns
 *             with a proven record and predicts a move within 30 minutes
 *             (never past the close)
 *   swing:    from the newest finished daily candle, a move within 5
 *             trading days (checked at start and again after each close)
 *
 * Each prediction comes with a suggested contract from the live chain, and
 * is checked against what the stock actually did (target first = WIN,
 * stop first = LOSS, neither by the deadline = EXPIRED).
 */
import type { Bar } from "../../../supabase/functions/_shared/patterns/detect";
import { MODES, type FilterImpact, type Mode, type MoveBoard, type MoveOutcome, type MovePrediction, type MoveRecords, type Skipped, boardFrom, filterImpact, moveRecords, predictMove, resolveMove } from "../../../supabase/functions/_shared/patterns/moves";
import { type Filters, indexFor, sameDayContext, swingContext } from "../../../supabase/functions/_shared/patterns/context";
import { type EarningsDate, type EconEvent, earningsBlockSameDay, earningsBlockSwing, newsBlock, nextEarnings } from "../../../supabase/functions/_shared/patterns/events";
import { etClock, sessionBounds, sessionFor } from "../../../supabase/functions/_shared/bot/session";
import { type ChainRow, type ContractPick, pickContract, realizedVol } from "./contractPicker";
import { type ChainView, chainView } from "./chainSignals";
import { type ConfidenceModel, type ModelCheck, score as modelScore, trainModel } from "../../../supabase/functions/_shared/patterns/model";
import type { BarContext, Trend } from "../../../supabase/functions/_shared/patterns/context";

export const OPTION_SYMBOLS = ["TSLA", "SPY", "AAPL", "NVDA", "QQQ"];

export interface OptionSignal extends MovePrediction {
  key: string;
  contract: ContractPick | null;
  /** Why there's no contract, if none. */
  contractNote?: string;
  outcome: MoveOutcome | null;
  exit: number | null;
  /** Result of the partial-profit plan in R (stop distances), once known. */
  planR?: number | null;
  /** Confidence score from the model (chance of reaching the target first), when the model is in use. */
  score?: number;
  /** Option walls and today's unusual buying, from the chain. */
  chainInfo?: { callWall: number | null; putWall: number | null; flow: ChainView["flow"] };
}

/** Filters, plus the live-only news and earnings checks. */
export interface ScanFilters extends Filters {
  news: boolean;
  earnings: boolean;
}

// Volume starts off: check "What the filters do" to see if it helps on your stocks.
export const DEFAULT_SCAN_FILTERS: ScanFilters = { trend: true, market: true, lunch: true, room: true, volume: false, news: true, earnings: true };

export interface OptionsDeps {
  /** Same day: as many 5-minute candles as the data source gives (regular hours). Swing: years of daily candles. */
  history(symbol: string, mode: Mode): Promise<Bar[]>;
  /** The newest 5-minute candles (today). */
  latest(symbol: string): Promise<Bar[]>;
  chain(symbol: string, mode: Mode): Promise<{ rows: ChainRow[]; spot: number } | null>;
  /** Economic calendar (null = not available). */
  econEvents?(fromMs: number, toMs: number): Promise<EconEvent[] | null>;
  /** Earnings dates for these symbols (null = not available). */
  earnings?(symbols: string[]): Promise<EarningsDate[] | null>;
  save?(s: OptionSignal): Promise<void>;
  saveResult?(s: OptionSignal): Promise<void>;
  now?(): number;
  setTimeout?(f: () => void, ms: number): unknown;
  clearTimeout?(t: unknown): void;
}

export interface OptionsSnapshot {
  running: boolean;
  symbols: string[];
  activity: string;
  boards: Partial<Record<Mode, MoveBoard>>;
  /** Candles loaded, per mode and symbol. */
  loaded: Record<Mode, Record<string, number>>;
  signals: OptionSignal[];
  nextCheckAt: number | null;
  error?: string;
  filters: ScanFilters;
  /** How each filter changes the hit rate, per mode. */
  impact: Partial<Record<Mode, FilterImpact[]>>;
  /** Setups that showed up but were skipped (newest first). */
  skipped: Skipped[];
  /** Whether the news / earnings checks have data. */
  calendars: { news: "on" | "unavailable" | "loading"; earnings: "on" | "unavailable" | "loading" };
  limits: Limits;
  /** Patterns paused because they've been losing live. */
  paused: Paused[];
  /** How the confidence model did on unseen (newer) history, per mode. */
  model: Partial<Record<Mode, ModelCheck>>;
  /** Score settings: use it (when it proved useful) and how far above average a setup must score. */
  scoring: { use: boolean; minEdge: number };
}

/** Daily guard rails for same-day predictions. */
export interface Limits {
  /** Most same-day predictions per day (0 = no limit). */
  maxPerDay: number;
  /** Stop for the day after this many losses (0 = never). */
  stopAfterLosses: number;
}
export const DEFAULT_LIMITS: Limits = { maxPerDay: 6, stopAfterLosses: 3 };

/** A pattern doing worse live than a random entry over its last 10 predictions. */
export interface Paused {
  key: string;
  mode: Mode;
  pattern: string;
  name: string;
  dir: "up" | "down";
  wins: number;
  n: number;
  baseline: number;
}

/** Live results checked per pattern before pausing it. */
export const POLICE_WINDOW = 10;

/**
 * Patterns whose last POLICE_WINDOW finished predictions (after `since`, if
 * given for that pattern) reached the target less often than a random entry.
 */
export function pausedPatterns(signals: OptionSignal[], since: Record<string, number> = {}): Paused[] {
  const groups = new Map<string, OptionSignal[]>();
  for (const s of signals) {
    if (!s.outcome) continue;
    for (const e of s.evidence) {
      const key = `${s.mode}|${e.pattern}|${s.dir}`;
      if (s.at <= (since[key] ?? 0)) continue;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
    }
  }
  const out: Paused[] = [];
  for (const [key, list] of groups) {
    const last = list.sort((a, b) => b.at - a.at).slice(0, POLICE_WINDOW);
    if (last.length < POLICE_WINDOW) continue;
    const wins = last.filter((x) => x.outcome === "win").length;
    const baseline = last.reduce((a, x) => a + x.baseline, 0) / last.length;
    if (wins / last.length < baseline) {
      const [mode, pattern, dir] = key.split("|");
      const name = last[0].evidence.find((e) => e.pattern === pattern)?.name ?? pattern;
      out.push({ key, mode: mode as Mode, pattern, name, dir: dir as "up" | "down", wins, n: last.length, baseline });
    }
  }
  return out;
}

export const optionKey = (s: Pick<MovePrediction, "symbol" | "mode" | "at">) => `${s.symbol}|${s.mode}|${s.at}`;

const M5 = 5 * 60_000;
const BOARD_TTL = 60 * 60_000;
/** Ask for the latest candles this long after each 5-minute close. */
const AFTER_CLOSE = 20_000;

export class OptionsScanner {
  private s: OptionsSnapshot = { running: false, symbols: [], activity: "Stopped", boards: {}, loaded: { sameday: {}, swing: {} }, signals: [], nextCheckAt: null, filters: DEFAULT_SCAN_FILTERS, impact: {}, skipped: [], calendars: { news: "loading", earnings: "loading" }, limits: DEFAULT_LIMITS, paused: [], model: {}, scoring: { use: true, minEdge: 0.05 } };
  private models: Partial<Record<Mode, ConfidenceModel>> = {};
  /** Pattern key -> time it was un-paused by hand (only later results count). */
  private unpausedAt: Record<string, number> = {};
  private records: Partial<Record<Mode, MoveRecords>> = {};
  private econ: EconEvent[] = [];
  private earningsDates: EarningsDate[] = [];
  private listeners = new Set<() => void>();
  private signalListeners = new Set<(s: OptionSignal) => void>();
  private bars: Record<Mode, Record<string, Bar[]>> = { sameday: {}, swing: {} };
  private boardAt = 0;
  private timer: unknown = null;
  private runId = 0;
  private lastSwingDay = "";

  constructor(private deps: OptionsDeps) {}

  private now = () => (this.deps.now ? this.deps.now() : Date.now());
  private later = (f: () => void, ms: number) => (this.deps.setTimeout ? this.deps.setTimeout(f, ms) : setTimeout(f, ms));
  private cancel = (t: unknown) => (this.deps.clearTimeout ? this.deps.clearTimeout(t) : clearTimeout(t as number));

  getSnapshot = () => this.s;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  onSignal(l: (s: OptionSignal) => void) {
    this.signalListeners.add(l);
    return () => {
      this.signalListeners.delete(l);
    };
  }
  private set(p: Partial<OptionsSnapshot>) {
    this.s = { ...this.s, ...p };
    this.listeners.forEach((l) => l());
  }

  seed(list: OptionSignal[]) {
    const keys = new Set(this.s.signals.map((x) => x.key));
    const add = list.filter((x) => !keys.has(x.key));
    if (add.length) this.set({ signals: [...this.s.signals, ...add].sort((a, b) => b.at - a.at) });
    this.police();
  }

  async start(symbols = OPTION_SYMBOLS) {
    this.stop();
    const id = ++this.runId;
    this.set({ running: true, symbols, activity: "Loading price history…", error: undefined });
    try {
      for (const mode of ["sameday", "swing"] as Mode[]) {
        for (const sym of this.loadList()) {
          if (id !== this.runId) return;
          this.set({ activity: `Loading ${mode === "sameday" ? "5-minute" : "daily"} history for ${sym}…` });
          this.bars[mode][sym] = await this.deps.history(sym, mode);
          this.set({ loaded: { ...this.s.loaded, [mode]: { ...this.s.loaded[mode], [sym]: this.bars[mode][sym].length } } });
        }
      }
      if (id !== this.runId) return;
      await this.loadCalendars();
      this.set({ activity: "Checking which patterns work…" });
      this.rebuildBoards();
      this.resolve();
      await this.swingPass(id);
      this.set({ activity: "Watching for setups" });
      this.schedule(id);
    } catch (e) {
      if (id === this.runId) this.set({ running: false, activity: "Stopped", error: (e as Error).message });
    }
  }

  stop() {
    this.runId++;
    if (this.timer) this.cancel(this.timer);
    this.timer = null;
    if (this.s.running) this.set({ running: false, activity: "Stopped", nextCheckAt: null });
  }

  private rebuildBoards() {
    for (const mode of ["sameday", "swing"] as Mode[]) {
      const series = this.loadList().map((symbol) => ({ symbol, bars: this.bars[mode][symbol] ?? [] })).filter((x) => x.bars.length > 60);
      // Indexes that aren't watched are loaded only to judge the market.
      const contextOnly = this.loadList().filter((x) => !this.s.symbols.includes(x));
      if (series.length) this.records[mode] = moveRecords(series, MODES[mode], contextOnly);
      const rec = this.records[mode];
      const trained = rec ? trainModel(rec) : null;
      if (trained) {
        this.models[mode] = trained.model;
        this.set({ model: { ...this.s.model, [mode]: trained.check } });
      }
    }
    this.boardAt = this.now();
    this.applyFilters();
  }

  /** Recompute the pattern stats for the current filters (fast: reuses the replayed trades). */
  private applyFilters() {
    const boards: OptionsSnapshot["boards"] = {};
    const impact: OptionsSnapshot["impact"] = {};
    for (const mode of ["sameday", "swing"] as Mode[]) {
      const rec = this.records[mode];
      if (!rec) continue;
      boards[mode] = boardFrom(rec, this.s.filters);
      impact[mode] = filterImpact(rec);
    }
    this.set({ boards, impact });
  }

  setScoring(v: Partial<OptionsSnapshot["scoring"]>) {
    this.set({ scoring: { ...this.s.scoring, ...v } });
  }

  /** The model's score for a prediction (best of its backing patterns), or null when the model isn't in use. */
  private scoreFor(p: MovePrediction, ctx: BarContext | undefined, market: Trend | null): number | null {
    const m = this.models[p.mode];
    const check = this.s.model[p.mode];
    if (!m || !check?.useful || !this.s.scoring.use) return null;
    return Math.max(...p.evidence.map((e) => modelScore(m, { pattern: e.pattern, dir: p.dir, ctx, market, px: p.entry })));
  }

  /** Reason to skip because the score is too low, or null. Sets p.score. */
  private scoreBlock(p: MovePrediction & { score?: number }, ctx: BarContext | undefined, market: Trend | null): string | null {
    const sc = this.scoreFor(p, ctx, market);
    if (sc === null) return null;
    p.score = sc;
    const need = (this.s.model[p.mode]?.testRate ?? p.baseline) + this.s.scoring.minEdge;
    return sc < need ? `confidence score ${Math.round(sc * 100)}% is below the ${Math.round(need * 100)}% needed` : null;
  }

  setLimits(l: Partial<Limits>) {
    this.set({ limits: { ...this.s.limits, ...l } });
  }

  /** Give a paused pattern a fresh start (only results from now on count). */
  unpause(key: string) {
    this.unpausedAt = { ...this.unpausedAt, [key]: this.now() };
    this.police();
  }

  private police() {
    this.set({ paused: pausedPatterns(this.s.signals, this.unpausedAt) });
  }

  /** Reasons a new same-day prediction can't be made today (limits). */
  private limitBlock(): string | null {
    const today = etClock(this.now()).date;
    const todays = this.s.signals.filter((x) => x.mode === "sameday" && etClock(x.at).date === today);
    const { maxPerDay, stopAfterLosses } = this.s.limits;
    if (maxPerDay > 0 && todays.length >= maxPerDay) return `daily limit reached (${todays.length} same-day predictions today)`;
    const losses = todays.filter((x) => x.outcome === "loss").length;
    if (stopAfterLosses > 0 && losses >= stopAfterLosses) return `${losses} losses today: done for the day`;
    return null;
  }

  /** Reason to skip because the backing pattern is paused. */
  private pausedBlock(p: MovePrediction): string | null {
    for (const e of p.evidence) {
      const hit = this.s.paused.find((x) => x.key === `${p.mode}|${e.pattern}|${p.dir}`);
      if (hit && e.verdict === "edge") return `${hit.name} is paused: it reached the target ${hit.wins} of its last ${hit.n} times, worse than a random entry`;
    }
    return null;
  }

  setFilters(f: Partial<ScanFilters>) {
    this.set({ filters: { ...this.s.filters, ...f } });
    this.applyFilters();
  }

  private async loadCalendars() {
    const now = this.now();
    const [ev, ea] = await Promise.all([
      this.deps.econEvents ? this.deps.econEvents(now - 86_400_000, now + 10 * 86_400_000).catch(() => null) : Promise.resolve(null),
      this.deps.earnings ? this.deps.earnings(this.s.symbols).catch(() => null) : Promise.resolve(null),
    ]);
    this.econ = ev ?? [];
    this.earningsDates = ea ?? [];
    this.set({ calendars: { news: ev ? "on" : "unavailable", earnings: ea ? "on" : "unavailable" } });
  }

  /** Watched symbols plus the indexes they're checked against. */
  private loadList(): string[] {
    return Array.from(new Set([...this.s.symbols, ...this.s.symbols.map(indexFor)]));
  }

  private skip(s: Skipped) {
    if (this.s.skipped.some((x) => x.symbol === s.symbol && x.mode === s.mode && x.at === s.at)) return;
    this.set({ skipped: [s, ...this.s.skipped].slice(0, 50) });
  }

  private schedule(id: number) {
    if (id !== this.runId) return;
    const now = this.now();
    let at = Math.floor(now / M5) * M5 + M5 + AFTER_CLOSE;
    // Outside market hours, wake at the next open (+ first candle).
    const b = sessionBounds(now);
    if (!sessionFor(now).isTradingDay || now > b.close + AFTER_CLOSE + 60_000) at = Math.max(at, now + 30 * 60_000);
    else if (now < b.open) at = b.open + M5 + AFTER_CLOSE;
    this.set({ nextCheckAt: at });
    this.timer = this.later(() => {
      void this.tick(id).finally(() => this.schedule(id));
    }, at - now);
  }

  private async tick(id: number) {
    const now = this.now();
    const sess = sessionFor(now);
    const b = sessionBounds(now);
    if (sess.isTradingDay && now >= b.open && now <= b.close + AFTER_CLOSE + 60_000) await this.sameDayPass(id);
    // Swing: once per day after the close.
    const today = etClock(now).date;
    if (sess.isTradingDay && now > b.close + 5 * 60_000 && this.lastSwingDay !== today) {
      for (const sym of this.loadList()) this.bars.swing[sym] = await this.deps.history(sym, "swing");
      await this.loadCalendars();
      await this.swingPass(id);
    }
    if (this.now() - this.boardAt > BOARD_TTL) this.rebuildBoards();
  }

  /** At a 5-minute close: newest candles, predictions, results. */
  async sameDayPass(id = this.runId) {
    if (id !== this.runId) return;
    const now = this.now();
    const board = this.s.boards.sameday;
    const close = sessionBounds(now).close;
    for (const sym of this.loadList()) {
      const fresh = await this.deps.latest(sym);
      const have = this.bars.sameday[sym] ?? [];
      const byTime = new Map(have.map((x) => [x.time, x]));
      // Finished candles only.
      for (const x of fresh) if (x.time + M5 <= now) byTime.set(x.time, x);
      this.bars.sameday[sym] = Array.from(byTime.values()).sort((a, c) => a.time - c.time);
    }
    this.resolve();
    if (!board) return;
    for (const sym of this.s.symbols) {
      const bars = this.bars.sameday[sym];
      const last = bars[bars.length - 1];
      if (!last) continue;
      const closedAt = last.time + M5;
      // Only the candle that just closed, and only if the 30 minutes fit before the close.
      if (now - closedAt > M5 || closedAt + MODES.sameday.horizon * M5 > close) continue;
      const ctx = sameDayContext(bars);
      const idx = this.bars.sameday[indexFor(sym)];
      const market = idx?.length ? (() => {
        const ic = sameDayContext(idx);
        const k = idx.findIndex((x) => x.time === last.time);
        return k >= 0 ? ic[k].trend : null;
      })() : null;
      const p = predictMove(sym, bars, board, closedAt, { ctx: ctx[ctx.length - 1], market, onSkip: (x) => this.skip(x) });
      if (!p) continue;
      const block = (this.s.filters.news ? newsBlock(closedAt, this.econ) : null) ?? (this.s.filters.earnings ? earningsBlockSameDay(sym, closedAt, this.earningsDates) : null) ?? this.pausedBlock(p) ?? this.scoreBlock(p, ctx[ctx.length - 1], market) ?? this.limitBlock();
      if (block) {
        this.skip({ symbol: sym, mode: "sameday", dir: p.dir, at: closedAt, names: p.evidence.map((e) => e.name).join(" + "), reasons: [block] });
        continue;
      }
      await this.add(p);
    }
  }

  /** Swing predictions from the newest finished daily candle. */
  async swingPass(id = this.runId) {
    if (id !== this.runId) return;
    const board = this.s.boards.swing;
    const now = this.now();
    const today = etClock(now).date;
    const b = sessionBounds(now);
    const marketOpen = sessionFor(now).isTradingDay && now < b.close + 5 * 60_000;
    this.lastSwingDay = sessionFor(now).isTradingDay && now > b.close ? today : this.lastSwingDay;
    if (!board) return;
    for (const sym of this.s.symbols) {
      let bars = this.bars.swing[sym] ?? [];
      // While today's candle is still forming, use the days before it.
      if (marketOpen) bars = bars.filter((x) => etClock(x.time + 12 * 3600_000).date < today);
      const last = bars[bars.length - 1];
      if (!last) continue;
      // Only fresh setups (the last finished day is at most 4 calendar days old).
      if (now - last.time > 4 * 86_400_000) continue;
      const ctx = swingContext(bars);
      const idx = this.bars.swing[indexFor(sym)];
      const im = idx?.length ? (() => {
        const ic = swingContext(idx);
        const k = idx.findIndex((x) => etClock(x.time + 12 * 3600_000).date === etClock(last.time + 12 * 3600_000).date);
        return k >= 0 ? ic[k].trend : null;
      })() : null;
      const p = predictMove(sym, bars, board, last.time, { ctx: ctx[ctx.length - 1], market: im, onSkip: (x) => this.skip(x) });
      if (!p) continue;
      const block = (this.s.filters.earnings ? earningsBlockSwing(sym, p.at, p.until, this.earningsDates) : null) ?? this.pausedBlock(p) ?? this.scoreBlock(p, ctx[ctx.length - 1], im);
      if (block) {
        this.skip({ symbol: sym, mode: "swing", dir: p.dir, at: p.at, names: p.evidence.map((e) => e.name).join(" + "), reasons: [block] });
        continue;
      }
      await this.add(p);
    }
  }

  private async add(p: MovePrediction) {
    const key = optionKey(p);
    if (this.s.signals.some((x) => x.key === key)) return;
    let contract: ContractPick | null = null;
    let contractNote: string | undefined;
    let chainInfo: OptionSignal["chainInfo"];
    try {
      const ch = await this.deps.chain(p.symbol, p.mode);
      if (!ch) contractNote = "Option chain needs a Schwab connection.";
      else {
        const view = chainView(ch.rows, { spot: ch.spot || p.entry, dir: p.dir, entry: p.entry, target: p.target, atr: p.atr, now: this.now() });
        chainInfo = { callWall: view.callWall, putWall: view.putWall, flow: view.flow };
        // A big option wall before the target: price often stalls there.
        if (this.s.filters.room && view.wallInWay) {
          this.skip({ symbol: p.symbol, mode: p.mode, dir: p.dir, at: p.at, names: p.evidence.map((e) => e.name).join(" + "), reasons: [`the ${view.wallInWay.kind} at $${view.wallInWay.price} is in the way of the target`] });
          return;
        }
        const daily = this.bars.swing[p.symbol] ?? [];
        contract = pickContract(ch.rows, {
          symbol: p.symbol, dir: p.dir, mode: p.mode, spot: ch.spot || p.entry, target: p.target, stop: p.stop, now: this.now(),
          realized: realizedVol(daily.map((x) => x.close)),
          earnings: nextEarnings(p.symbol, this.now(), this.earningsDates),
        });
        if (!contract) contractNote = "No option with a live price right now.";
      }
    } catch (e) {
      contractNote = `Couldn't load the option chain: ${(e as Error).message}`;
    }
    const sig: OptionSignal = { ...p, key, contract, ...(contractNote ? { contractNote } : {}), ...(chainInfo ? { chainInfo } : {}), outcome: null, exit: null };
    this.set({ signals: [sig, ...this.s.signals].slice(0, 500) });
    this.signalListeners.forEach((l) => l(sig));
    void this.deps.save?.(sig);
  }

  /** WIN / LOSS / EXPIRED for predictions whose result is known. */
  resolve() {
    let changed = false;
    const next = this.s.signals.map((sig) => {
      if (sig.outcome) return sig;
      const bars = this.bars[sig.mode][sig.symbol];
      if (!bars?.length) return sig;
      const r = resolveMove(sig, bars, this.now());
      if (!r) return sig;
      changed = true;
      const done = { ...sig, outcome: r.o, exit: r.exit, planR: r.planR };
      void this.deps.saveResult?.(done);
      return done;
    });
    if (changed) {
      this.set({ signals: next });
      this.police();
    }
  }
}

/* ---- report --------------------------------------------------------------- */

export interface OptionsReport {
  lines: Array<{ when: string; symbol: string; dir: "CALL" | "PUT"; mode: Mode; result: "WIN" | "LOSS" | "EXPIRED" | "OPEN"; contract: string | null; estPnl: number | null }>;
  wins: number;
  losses: number;
  expired: number;
  open: number;
  /** Wins / decided (expired counts as not a win). */
  winRate: number;
  /** Sum of the estimated per-contract results (target / stop estimates). */
  estPnl: number;
}

export function optionsReport(signals: OptionSignal[], from: number, to: number, mode?: Mode): OptionsReport {
  const list = signals.filter((s) => s.at >= from && s.at < to && (!mode || s.mode === mode)).sort((a, b) => a.at - b.at);
  const lines = list.map((s) => {
    const result: OptionsReport["lines"][number]["result"] = s.outcome === "win" ? "WIN" : s.outcome === "loss" ? "LOSS" : s.outcome === "expired" ? "EXPIRED" : "OPEN";
    const est = !s.contract ? null : result === "WIN" ? s.contract.profitAtTarget : result === "LOSS" ? s.contract.lossAtStop : null;
    const d = new Date(s.at);
    const when = s.mode === "sameday" ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }) : d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", timeZone: "UTC" });
    return { when, symbol: s.symbol, dir: s.dir === "up" ? ("CALL" as const) : ("PUT" as const), mode: s.mode, result, contract: s.contract?.label ?? null, estPnl: est };
  });
  const wins = lines.filter((l) => l.result === "WIN").length;
  const losses = lines.filter((l) => l.result === "LOSS").length;
  const expired = lines.filter((l) => l.result === "EXPIRED").length;
  const decided = wins + losses + expired;
  return { lines, wins, losses, expired, open: lines.length - decided, winRate: decided ? wins / decided : 0, estPnl: lines.reduce((a, l) => a + (l.estPnl ?? 0), 0) };
}
