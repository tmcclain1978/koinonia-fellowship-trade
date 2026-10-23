/**
 * Saved PocketOption candles, per asset (EURUSD_otc and EURUSD are
 * different price series, so they are stored separately).
 *
 * One store for the whole app: candles from PocketOption's history, from
 * live prices, and from "load older candles" all go through add(), which
 * keeps them in memory (sorted, one per minute) and saves new ones in the
 * background, skipping any already in the database.
 */
import type { Bar } from "../../../supabase/functions/_shared/patterns/detect";

export interface CandleRow {
  user_id: string;
  pair: string;
  timeframe: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  direction: "up" | "down" | "neutral";
}

export interface CandleDb {
  userId(): Promise<string | null>;
  /** Newest-first page of saved 1m candles for an asset. */
  page(userId: string, asset: string, from: number, to: number): Promise<Array<{ timestamp: string; open: unknown; high: unknown; low: unknown; close: unknown; volume?: unknown }>>;
  /** Insert, skipping rows that already exist. */
  save(rows: CandleRow[]): Promise<void>;
}

export interface AssetCandles {
  asset: string;
  bars: Bar[];
  /** Loaded from the database at least once. */
  loaded: boolean;
  loading: boolean;
  /** Waiting to be saved. */
  unsaved: number;
  saving: boolean;
  lastError?: string;
  /** Candles saved since the app opened. */
  savedThisSession: number;
}

const PAGE = 1000;
/** Most recent candles kept for analysis (~21 days of 1-minute candles). */
export const MAX_BARS = 30_000;
const SAVE_CHUNK = 500;

export class CandleStore {
  private data = new Map<string, Map<number, Bar>>();
  private state = new Map<string, AssetCandles>();
  private queue = new Map<string, Bar[]>();
  /** Candles built from live prices, kept in memory only until PocketOption's own version arrives. */
  private provisional = new Map<string, Set<number>>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private version = 0;

  constructor(private db: CandleDb, private saveDelayMs = 3000) {}

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  /** Changes whenever any asset changes (for useSyncExternalStore). */
  getVersion = () => this.version;

  get(asset: string): AssetCandles {
    let s = this.state.get(asset);
    if (!s) {
      s = { asset, bars: [], loaded: false, loading: false, unsaved: 0, saving: false, savedThisSession: 0 };
      this.state.set(asset, s);
    }
    return s;
  }

  private update(asset: string, patch: Partial<AssetCandles>) {
    this.state.set(asset, { ...this.get(asset), ...patch });
    this.version++;
    this.listeners.forEach((l) => l());
  }

  private rebuild(asset: string): Bar[] {
    const m = this.data.get(asset);
    if (!m) return [];
    let bars = Array.from(m.values()).sort((a, b) => a.time - b.time);
    if (bars.length > MAX_BARS) {
      bars = bars.slice(-MAX_BARS);
      const keep = new Map<number, Bar>();
      for (const b of bars) keep.set(b.time, b);
      this.data.set(asset, keep);
    }
    return bars;
  }

  /** Load what's saved for this asset (newest MAX_BARS). Safe to call again. */
  async load(asset: string): Promise<void> {
    const s = this.get(asset);
    if (s.loading || s.loaded) return;
    this.update(asset, { loading: true });
    try {
      const uid = await this.db.userId();
      if (!uid) throw new Error("Not signed in");
      const m = this.data.get(asset) ?? new Map<number, Bar>();
      for (let from = 0; from < MAX_BARS; from += PAGE) {
        const rows = await this.db.page(uid, asset, from, from + PAGE - 1);
        for (const r of rows) {
          const time = new Date(r.timestamp).getTime();
          const bar: Bar = { time, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), ...(r.volume != null ? { volume: Number(r.volume) } : {}) };
          // Older versions saved raw price ticks as flat "candles" at odd times: skip those.
          const flat = bar.open === bar.high && bar.high === bar.low && bar.low === bar.close;
          if (time % 60_000 !== 0 || flat || !(bar.high >= bar.low)) continue;
          if (!m.has(time)) m.set(time, bar);
        }
        if (rows.length < PAGE) break;
      }
      this.data.set(asset, m);
      this.update(asset, { bars: this.rebuild(asset), loaded: true, loading: false, lastError: undefined });
    } catch (e) {
      this.update(asset, { loading: false, lastError: (e as Error).message });
    }
  }

  /** Read the database again (after the server saved new candles). Keeps what's in memory. */
  async reload(asset: string): Promise<void> {
    if (this.get(asset).loading) return;
    this.update(asset, { loaded: false });
    await this.load(asset);
  }

  /**
   * Add finished 1-minute candles. New ones are kept and queued for saving;
   * a candle already known is updated in memory (PocketOption's own version
   * wins). With save: false (candles built from live prices) they are only
   * kept in memory until PocketOption's version replaces them.
   */
  add(asset: string, candles: Bar[], opts: { save?: boolean } = {}): number {
    if (!candles.length) return 0;
    const m = this.data.get(asset) ?? new Map<number, Bar>();
    this.data.set(asset, m);
    let prov = this.provisional.get(asset);
    if (!prov) this.provisional.set(asset, (prov = new Set()));
    const save = opts.save !== false;
    const fresh: Bar[] = [];
    for (const c of candles) {
      if (c.time % 60_000 !== 0 || !(c.high >= c.low) || !(c.close > 0)) continue;
      const known = m.has(c.time);
      if (!save) {
        // Never replace a real candle with one built from live prices.
        if (known && !prov.has(c.time)) continue;
        prov.add(c.time);
        m.set(c.time, c);
        continue;
      }
      if (!known || prov.has(c.time)) fresh.push(c);
      prov.delete(c.time);
      m.set(c.time, c);
    }
    if (fresh.length && opts.save !== false) {
      const q = this.queue.get(asset) ?? [];
      q.push(...fresh);
      this.queue.set(asset, q);
      this.schedule();
    }
    this.update(asset, { bars: this.rebuild(asset), unsaved: this.queue.get(asset)?.length ?? 0 });
    return fresh.length;
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.saveDelayMs);
  }

  /** Save everything queued now. */
  async flush(): Promise<void> {
    const uid = await this.db.userId().catch(() => null);
    if (!uid) return;
    for (const [asset, q] of this.queue) {
      if (!q.length || this.get(asset).saving) continue;
      const batch = q.splice(0, q.length);
      this.update(asset, { saving: true, unsaved: q.length });
      let saved = 0;
      try {
        for (let i = 0; i < batch.length; i += SAVE_CHUNK) {
          const chunk = batch.slice(i, i + SAVE_CHUNK);
          await this.db.save(chunk.map((c) => toRow(uid, asset, c)));
          saved += chunk.length;
        }
        this.update(asset, { saving: false, unsaved: q.length, lastError: undefined, savedThisSession: this.get(asset).savedThisSession + saved });
      } catch (e) {
        // Put back what wasn't saved and try again later.
        q.unshift(...batch.slice(saved));
        this.update(asset, { saving: false, unsaved: q.length, lastError: (e as Error).message, savedThisSession: this.get(asset).savedThisSession + saved });
        this.schedule();
      }
    }
  }
}

export function toRow(userId: string, asset: string, c: Bar): CandleRow {
  return {
    user_id: userId,
    pair: asset,
    timeframe: "1m",
    timestamp: new Date(c.time).toISOString(),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume ?? null,
    direction: c.close > c.open ? "up" : c.close < c.open ? "down" : "neutral",
  };
}

/** Holes in the data: runs of missing minutes (ignores weekends for regular forex). */
export function gaps(bars: Bar[], minGapMin = 2): Array<{ from: number; to: number; minutes: number }> {
  const out: Array<{ from: number; to: number; minutes: number }> = [];
  for (let i = 1; i < bars.length; i++) {
    const missing = (bars[i].time - bars[i - 1].time) / 60_000 - 1;
    if (missing >= minGapMin) out.push({ from: bars[i - 1].time + 60_000, to: bars[i].time - 60_000, minutes: missing });
  }
  return out;
}
