/**
 * Signal scanner: watches many PocketOption pairs at once and, at every
 * candle close, prints a call for any pair whose recognized patterns have a
 * proven record: "EUR/USD OTC · 21:15 · CALL". When that candle closes it
 * marks the call WIN or LOSS. Every call is kept, losses included.
 *
 * One scanner for the whole app (keeps running while you switch tabs).
 */
import { type Bar, aggregate } from "../../../supabase/functions/_shared/patterns/detect";
import { type Scoreboard, scoreboard } from "../../../supabase/functions/_shared/patterns/stats";
import { type Forecast, type ForecastResult, forecastNext, resolveForecast } from "../../../supabase/functions/_shared/patterns/forecast";
import { MIN_DAYS, colorsByMinute, daysCovered, timeSignals } from "../../../supabase/functions/_shared/patterns/schedule";
import { breakEven } from "../../../supabase/functions/_shared/patterns/stats";

export interface ScanSignal extends Forecast {
  key: string;
  /** "EUR/USD OTC" */
  name: string;
  /** pattern: called when the candle before closed; time: announced in advance from the time-of-day record. */
  source: "pattern" | "time";
  result: ForecastResult | null;
}

/** How far ahead time-of-day predictions are announced. */
export const LOOKAHEAD_MS = 60 * 60_000;

export interface PairStatus {
  asset: string;
  name: string;
  candles: number;
  /** Has a pattern record to judge calls by. */
  ready: boolean;
  /** Days of history (time-of-day predictions need 14+). */
  days: number;
  note?: string;
}

export interface ScannerSnapshot {
  running: boolean;
  assets: string[];
  tf: number;
  expiry: number;
  /** Only calls backed by a "Has an edge" pattern. */
  strongOnly: boolean;
  pairs: Record<string, PairStatus>;
  signals: ScanSignal[];
  /** What it's doing right now, in plain words. */
  activity: string;
  lastScanAt: number | null;
  nextScanAt: number | null;
}

export interface ScannerDeps {
  ready(): boolean;
  fetchLatest(asset: string): Promise<{ candles: Bar[]; error?: string }>;
  loadHistory(asset: string, days: number): Promise<{ loaded: number; error?: string }>;
  store: {
    load(asset: string): Promise<void>;
    bars(asset: string): Bar[];
    add(asset: string, bars: Bar[]): number;
  };
  payout(asset: string): number;
  name(asset: string): string;
  save?(s: ScanSignal): Promise<void>;
  saveResult?(s: ScanSignal, r: ForecastResult): Promise<void>;
  now?(): number;
  setTimeout?(f: () => void, ms: number): unknown;
  clearTimeout?(t: unknown): void;
}

/** Candles needed before a pair's record means anything (~5 days of 1-minute candles). */
export const MIN_HISTORY = 7000;
/** Recompute a pair's pattern record this often. */
const BOARD_TTL_MS = 15 * 60_000;
/** Ask PocketOption this long after the candle closes (its last candle is final by then). */
const AFTER_CLOSE_MS = 1500;

export const signalKey = (s: Pick<Forecast, "asset" | "tf" | "start" | "expiry">) => `${s.asset}|${s.tf}|${s.start}|${s.expiry}`;

export class SignalScanner {
  private s: ScannerSnapshot = { running: false, assets: [], tf: 1, expiry: 1, strongOnly: false, pairs: {}, signals: [], activity: "Stopped", lastScanAt: null, nextScanAt: null };
  private listeners = new Set<() => void>();
  private signalListeners = new Set<(s: ScanSignal) => void>();
  private timer: unknown = null;
  private boards = new Map<string, { board: Scoreboard; at: number; key: string }>();
  private minutes = new Map<string, { byMinute: Int8Array[]; at: number }>();
  private runId = 0;
  private scanning = false;
  private historyDays = 7;

  constructor(private deps: ScannerDeps) {}

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
  /** Called for each new call (for alerts). */
  onSignal(l: (s: ScanSignal) => void) {
    this.signalListeners.add(l);
    return () => {
      this.signalListeners.delete(l);
    };
  }
  private set(p: Partial<ScannerSnapshot>) {
    this.s = { ...this.s, ...p };
    this.listeners.forEach((l) => l());
  }
  private setPair(asset: string, p: Partial<PairStatus>) {
    const cur = this.s.pairs[asset] ?? { asset, name: this.deps.name(asset), candles: 0, ready: false, days: 0 };
    this.set({ pairs: { ...this.s.pairs, [asset]: { ...cur, ...p } } });
  }

  /** Calls from earlier (e.g. loaded from the database), merged in. */
  seed(list: ScanSignal[]) {
    const keys = new Set(this.s.signals.map((x) => x.key));
    const add = list.filter((x) => !keys.has(x.key));
    if (add.length) this.set({ signals: [...this.s.signals, ...add].sort((a, b) => b.start - a.start) });
  }

  setStrongOnly(v: boolean) {
    this.set({ strongOnly: v });
  }

  async start(assets: string[], opts: { tf: number; expiry: number; historyDays?: number }) {
    this.historyDays = opts.historyDays ?? 7;
    this.stop();
    const id = ++this.runId;
    const pairs: Record<string, PairStatus> = {};
    for (const a of assets) pairs[a] = { asset: a, name: this.deps.name(a), candles: 0, ready: false, days: 0 };
    this.set({ running: true, assets, tf: opts.tf, expiry: opts.expiry, pairs, activity: "Getting candle history ready…", nextScanAt: null });
    this.scheduleNext(id); // scanning starts right away; pairs join as their history is ready
    await this.prepare(id);
  }

  stop() {
    this.runId++;
    if (this.timer) this.cancel(this.timer);
    this.timer = null;
    if (this.s.running) this.set({ running: false, activity: "Stopped", nextScanAt: null });
  }

  /** Make sure every pair has enough saved candles (loads 7 days where needed, one pair at a time). */
  private async prepare(id: number) {
    for (const asset of this.s.assets) {
      if (id !== this.runId) return;
      await this.deps.store.load(asset);
      let n = this.deps.store.bars(asset).length;
      this.setPair(asset, { candles: n });
      const have = daysCovered(this.deps.store.bars(asset));
      if ((n < MIN_HISTORY || have < this.historyDays - 0.5) && this.deps.ready()) {
        this.set({ activity: `Loading ${this.historyDays} days of ${this.deps.name(asset)} candles…` });
        const r = await this.deps.loadHistory(asset, this.historyDays);
        if (id !== this.runId) return;
        n = this.deps.store.bars(asset).length;
        this.setPair(asset, { candles: n, ...(r.error ? { note: r.error } : {}) });
      }
      this.board(asset, true);
    }
    if (id === this.runId) this.set({ activity: "Scanning at every candle close" });
  }

  /** The pair's pattern record (cached; rebuilt every 15 minutes). */
  private board(asset: string, force = false): Scoreboard | null {
    const bars = aggregate(this.deps.store.bars(asset), this.s.tf);
    const key = `${this.s.tf}|${this.s.expiry}|${this.deps.payout(asset)}`;
    const cached = this.boards.get(asset);
    if (!force && cached && cached.key === key && this.now() - cached.at < BOARD_TTL_MS) return cached.board;
    if (bars.length < MIN_HISTORY / this.s.tf) {
      this.setPair(asset, { ready: false, candles: this.deps.store.bars(asset).length });
      return null;
    }
    const board = scoreboard(bars, { expiries: [this.s.expiry], payout: this.deps.payout(asset), tfMs: this.s.tf * 60_000 });
    this.boards.set(asset, { board, at: this.now(), key });
    const raw = this.deps.store.bars(asset);
    this.setPair(asset, { ready: true, candles: raw.length, days: Math.floor(daysCovered(raw)), note: undefined });
    return board;
  }

  private scheduleNext(id: number) {
    if (id !== this.runId) return;
    const period = this.s.tf * 60_000;
    const at = Math.floor(this.now() / period) * period + period + AFTER_CLOSE_MS;
    this.set({ nextScanAt: at });
    this.timer = this.later(() => {
      void this.scan(id).finally(() => this.scheduleNext(id));
    }, at - this.now());
  }

  /** One pass: newest candles for every pair, then a call where the record supports one. */
  async scan(id = this.runId): Promise<ScanSignal[]> {
    if (id !== this.runId || this.scanning || !this.deps.ready()) return [];
    this.scanning = true;
    const made: ScanSignal[] = [];
    try {
      const period = this.s.tf * 60_000;
      const periodStart = Math.floor(this.now() / period) * period;
      const minuteStart = Math.floor(this.now() / 60_000) * 60_000;
      const results = await pool(this.s.assets, 4, (a) => this.deps.fetchLatest(a));
      if (id !== this.runId) return [];
      this.s.assets.forEach((asset, k) => {
        const r = results[k];
        // The newest candle in PocketOption's answer may still be forming: keep finished ones only.
        if (r.candles.length) this.deps.store.add(asset, r.candles.filter((c) => c.time < minuteStart));
        this.setPair(asset, { candles: this.deps.store.bars(asset).length, ...(r.error ? { note: r.error } : {}) });
      });
      this.resolve();
      for (const asset of this.s.assets) {
        const board = this.board(asset);
        if (!board) continue;
        const bars = aggregate(this.deps.store.bars(asset), this.s.tf);
        const last = bars[bars.length - 1];
        // Only if we have the candle that just closed (no stale calls).
        if (!last || last.time + period !== periodStart) continue;
        const f = forecastNext(asset, bars, board, { expiry: this.s.expiry, payout: this.deps.payout(asset), tf: this.s.tf });
        if (!f?.call) continue;
        if (this.s.strongOnly && f.strength !== "strong") continue;
        const sig: ScanSignal = { ...f, key: signalKey(f), name: this.deps.name(asset), source: "pattern", result: null };
        if (this.s.signals.some((x) => x.key === sig.key)) continue;
        made.push(sig);
      }
      // Time-of-day predictions for the coming hour (1-minute candles, 1-candle trades).
      if (this.s.tf === 1 && this.s.expiry === 1) {
        const known = new Set([...this.s.signals, ...made].map((x) => x.key));
        for (const asset of this.s.assets) {
          for (const sig of this.timeCalls(asset)) {
            if (known.has(sig.key)) continue;
            if (this.s.strongOnly && sig.strength !== "strong") continue;
            known.add(sig.key);
            made.push(sig);
          }
        }
      }
      if (made.length) {
        this.set({ signals: [...made, ...this.s.signals].sort((a, b) => b.start - a.start).slice(0, 1000) });
        for (const sig of made) {
          this.signalListeners.forEach((l) => l(sig));
          void this.deps.save?.(sig);
        }
      }
      this.set({ lastScanAt: this.now() });
    } finally {
      this.scanning = false;
    }
    return made;
  }

  /** Advance predictions for this pair's next hour, from how each minute closed on past days. */
  private timeCalls(asset: string): ScanSignal[] {
    const raw = this.deps.store.bars(asset);
    if (daysCovered(raw) < MIN_DAYS) return [];
    let m = this.minutes.get(asset);
    if (!m || this.now() - m.at > BOARD_TTL_MS) {
      m = { byMinute: colorsByMinute(raw), at: this.now() };
      this.minutes.set(asset, m);
    }
    const payout = this.deps.payout(asset);
    const be = breakEven(payout);
    // From the candle after the one forming now.
    const from = Math.floor(this.now() / 60_000) * 60_000 + 60_000;
    return timeSignals(m.byMinute, from, from + LOOKAHEAD_MS, payout).map((t) => {
      const hhmm = new Date(t.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const word = t.dir === "up" ? "green" : "red";
      const f: Forecast = {
        asset,
        tf: 1,
        expiry: 1,
        start: t.start,
        end: t.start + 60_000,
        entry: 0,
        pUp: t.dir === "up" ? t.winRate : 1 - t.winRate,
        call: t.dir,
        lean: t.dir,
        confidence: t.winRate,
        breakEven: be,
        strength: t.floor > be + 0.08 ? "strong" : "moderate",
        evidence: [{ kind: "time", label: `The ${hhmm} candle on past days`, dir: t.dir, winRate: t.winRate, n: t.n, verdict: "edge" }],
        reason: `The ${hhmm} candle closed ${word} on ${t.wins} of the last ${t.n} days (newest ${t.recent.n} days: ${Math.round(t.recent.winRate * 100)}%).`,
      };
      return { ...f, key: signalKey(f), name: this.deps.name(asset), source: "time" as const, result: null };
    });
  }

  /** WIN / LOSS for calls whose candle has closed. */
  resolve() {
    let changed = false;
    const next = this.s.signals.map((sig) => {
      if (sig.result) return sig;
      const bars = aggregate(this.deps.store.bars(sig.asset), sig.tf);
      const r = sig.source === "time" ? candleColor(sig, bars) : resolveForecast(sig, bars);
      if (!r) return sig;
      changed = true;
      void this.deps.saveResult?.(sig, r);
      return { ...sig, result: r };
    });
    if (changed) this.set({ signals: next });
  }
}

/** Time-of-day calls are about one candle's color: its close against its own open. */
function candleColor(sig: ScanSignal, bars: Bar[]): ForecastResult | null {
  for (let j = bars.length - 1; j >= 0; j--) {
    const b = bars[j];
    if (b.time < sig.start) return null;
    if (b.time !== sig.start) continue;
    // The store only holds finished candles, so if it's here it has closed.
    const actual = b.close > b.open ? "up" : b.close < b.open ? "down" : "flat";
    return { actual, exit: b.close, correct: actual === sig.call };
  }
  return null;
}

/** Run `f` over `items`, at most `n` at a time, keeping order. */
async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await f(items[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/* ---- the day report ------------------------------------------------------ */

export interface DayReport {
  /** "23/10" */
  date: string;
  lines: Array<{ time: string; name: string; dir: "CALL" | "PUT"; result: "WIN" | "LOSS" | "DRAW" | "OPEN" }>;
  wins: number;
  losses: number;
  draws: number;
  open: number;
  winRate: number;
}

const two = (n: number) => String(n).padStart(2, "0");

/** Calls whose candle started on the local day of `day`, oldest first. */
export function dayReport(signals: ScanSignal[], day: Date): DayReport {
  const y = day.getFullYear();
  const m = day.getMonth();
  const d = day.getDate();
  const today = signals.filter((s) => {
    const t = new Date(s.start);
    return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d && s.call;
  }).sort((a, b) => a.start - b.start);
  const lines = today.map((s) => {
    const t = new Date(s.start);
    const result: DayReport["lines"][number]["result"] = !s.result ? "OPEN" : s.result.actual === "flat" ? "DRAW" : s.result.correct ? "WIN" : "LOSS";
    return { time: `${two(t.getHours())}:${two(t.getMinutes())}`, name: s.name, dir: s.call === "up" ? "CALL" as const : "PUT" as const, result };
  });
  const wins = lines.filter((l) => l.result === "WIN").length;
  const losses = lines.filter((l) => l.result === "LOSS").length;
  return { date: `${two(d)}/${two(m + 1)}`, lines, wins, losses, draws: lines.filter((l) => l.result === "DRAW").length, open: lines.filter((l) => l.result === "OPEN").length, winRate: wins + losses ? wins / (wins + losses) : 0 };
}

const MARK = { WIN: "✅", LOSS: "❌", DRAW: "➖", OPEN: "⏳" };

/** Plain text in the familiar channel format, every call included. */
export function reportText(r: DayReport): string {
  const body = r.lines.map((l) => `${l.name} - ${l.time} - ${l.dir} -> ${l.result} ${MARK[l.result]}`).join("\n");
  const totals = [`${two(r.wins)} WIN${r.wins === 1 ? "" : "S"} ✅`, `${two(r.losses)} LOSS${r.losses === 1 ? "" : "ES"} ❌`];
  if (r.draws) totals.push(`${two(r.draws)} DRAW${r.draws === 1 ? "" : "S"} ➖`);
  if (r.open) totals.push(`${two(r.open)} STILL OPEN ⏳`);
  const rate = r.wins + r.losses ? `\nWin rate: ${Math.round(r.winRate * 100)}% (every call listed, losses included)` : "";
  return `OPERATIONS REPORT (${r.date}) 📊\n\n${body || "No calls yet today."}\n\n${totals.join("\n")}${rate}`;
}
