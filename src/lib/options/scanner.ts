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
import { MODES, type Mode, type MoveBoard, type MoveOutcome, type MovePrediction, moveBoard, predictMove, resolveMove } from "../../../supabase/functions/_shared/patterns/moves";
import { etClock, sessionBounds, sessionFor } from "../../../supabase/functions/_shared/bot/session";
import { type ChainRow, type ContractPick, pickContract } from "./contractPicker";

export const OPTION_SYMBOLS = ["TSLA", "SPY", "AAPL", "NVDA", "QQQ"];

export interface OptionSignal extends MovePrediction {
  key: string;
  contract: ContractPick | null;
  /** Why there's no contract, if none. */
  contractNote?: string;
  outcome: MoveOutcome | null;
  exit: number | null;
}

export interface OptionsDeps {
  /** Same day: as many 5-minute candles as the data source gives (regular hours). Swing: years of daily candles. */
  history(symbol: string, mode: Mode): Promise<Bar[]>;
  /** The newest 5-minute candles (today). */
  latest(symbol: string): Promise<Bar[]>;
  chain(symbol: string, mode: Mode): Promise<{ rows: ChainRow[]; spot: number } | null>;
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
}

export const optionKey = (s: Pick<MovePrediction, "symbol" | "mode" | "at">) => `${s.symbol}|${s.mode}|${s.at}`;

const M5 = 5 * 60_000;
const BOARD_TTL = 60 * 60_000;
/** Ask for the latest candles this long after each 5-minute close. */
const AFTER_CLOSE = 20_000;

export class OptionsScanner {
  private s: OptionsSnapshot = { running: false, symbols: [], activity: "Stopped", boards: {}, loaded: { sameday: {}, swing: {} }, signals: [], nextCheckAt: null };
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
  }

  async start(symbols = OPTION_SYMBOLS) {
    this.stop();
    const id = ++this.runId;
    this.set({ running: true, symbols, activity: "Loading price history…", error: undefined });
    try {
      for (const mode of ["sameday", "swing"] as Mode[]) {
        for (const sym of symbols) {
          if (id !== this.runId) return;
          this.set({ activity: `Loading ${mode === "sameday" ? "5-minute" : "daily"} history for ${sym}…` });
          this.bars[mode][sym] = await this.deps.history(sym, mode);
          this.set({ loaded: { ...this.s.loaded, [mode]: { ...this.s.loaded[mode], [sym]: this.bars[mode][sym].length } } });
        }
      }
      if (id !== this.runId) return;
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
    const boards: OptionsSnapshot["boards"] = {};
    for (const mode of ["sameday", "swing"] as Mode[]) {
      const series = this.s.symbols.map((symbol) => ({ symbol, bars: this.bars[mode][symbol] ?? [] })).filter((x) => x.bars.length > 60);
      if (series.length) boards[mode] = moveBoard(series, MODES[mode]);
    }
    this.boardAt = this.now();
    this.set({ boards });
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
      for (const sym of this.s.symbols) this.bars.swing[sym] = await this.deps.history(sym, "swing");
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
    for (const sym of this.s.symbols) {
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
      const p = predictMove(sym, bars, board, closedAt);
      if (p) await this.add(p);
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
      const p = predictMove(sym, bars, board, last.time);
      if (p) await this.add(p);
    }
  }

  private async add(p: MovePrediction) {
    const key = optionKey(p);
    if (this.s.signals.some((x) => x.key === key)) return;
    let contract: ContractPick | null = null;
    let contractNote: string | undefined;
    try {
      const ch = await this.deps.chain(p.symbol, p.mode);
      if (!ch) contractNote = "Option chain needs a Schwab connection.";
      else {
        contract = pickContract(ch.rows, { symbol: p.symbol, dir: p.dir, mode: p.mode, spot: ch.spot || p.entry, target: p.target, stop: p.stop, now: this.now() });
        if (!contract) contractNote = "No option with a live price right now.";
      }
    } catch (e) {
      contractNote = `Couldn't load the option chain: ${(e as Error).message}`;
    }
    const sig: OptionSignal = { ...p, key, contract, ...(contractNote ? { contractNote } : {}), outcome: null, exit: null };
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
      const done = { ...sig, outcome: r.o, exit: r.exit };
      void this.deps.saveResult?.(done);
      return done;
    });
    if (changed) this.set({ signals: next });
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
