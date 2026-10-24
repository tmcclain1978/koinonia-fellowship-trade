/**
 * React side of the PocketOption Pattern Engine: saved candles, the pattern
 * scoreboard, live signals (with outcomes), and background collection.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { CandleStore, type AssetCandles } from "@/lib/pocketoption/candleStore";
import { type Signal, resolveSignals, signalKey, signalsOnLast } from "@/lib/pocketoption/signals";
import { type Bar, type Dir, type PatternId, aggregate } from "../../supabase/functions/_shared/patterns/detect";
import { type Scoreboard, scoreboard } from "../../supabase/functions/_shared/patterns/stats";
import { type Forecast, type ForecastResult, forecastNext, resolveForecast } from "../../supabase/functions/_shared/patterns/forecast";

/* ---- candles ------------------------------------------------------------ */

export const candleStore = new CandleStore({
  userId: async () => (await supabase.auth.getSession()).data.session?.user.id ?? null,
  page: async (userId, asset, from, to) => {
    const { data, error } = await supabase
      .from("pocketoption_candles")
      .select("timestamp, open, high, low, close, volume")
      .eq("user_id", userId)
      .eq("pair", asset)
      .eq("timeframe", "1m")
      .order("timestamp", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  save: async (rows) => {
    const { error } = await supabase.from("pocketoption_candles").upsert(rows, { onConflict: "user_id,pair,timeframe,timestamp", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  },
});

export function usePoCandles(asset: string): AssetCandles {
  useSyncExternalStore(candleStore.subscribe, candleStore.getVersion);
  useEffect(() => {
    void candleStore.load(asset);
  }, [asset]);
  return candleStore.get(asset);
}

/* ---- scoreboard --------------------------------------------------------- */

export const EXPIRIES = [1, 2, 3, 5];

/**
 * Pattern stats for these candles, recomputed in the background (at most
 * every few seconds while candles stream in, right away when settings change).
 */
export function useScoreboard(bars: Bar[], tf: number, payout: number, asset: string): { board: Scoreboard | null; computing: boolean } {
  const [board, setBoard] = useState<Scoreboard | null>(null);
  const [computing, setComputing] = useState(false);
  const lastRun = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const settingsKey = `${asset}|${tf}|${payout}`;
  useEffect(() => {
    if (bars.length < 60) {
      setBoard(null);
      return;
    }
    const sameSettings = lastRun.current.key === settingsKey;
    const wait = sameSettings ? Math.max(0, 5000 - (Date.now() - lastRun.current.at)) : 0;
    setComputing(true);
    const t = setTimeout(() => {
      const b = scoreboard(bars, { expiries: EXPIRIES, payout, tfMs: tf * 60_000 });
      lastRun.current = { key: settingsKey, at: Date.now() };
      setBoard(b);
      setComputing(false);
    }, wait || 30);
    return () => clearTimeout(t);
  }, [bars, tf, payout, settingsKey]);
  return { board, computing };
}

/** Candles at the chosen size (1 = as saved). */
export function useBars(bars1m: Bar[], tf: number): Bar[] {
  return useMemo(() => aggregate(bars1m, tf), [bars1m, tf]);
}

/* ---- live signals ------------------------------------------------------- */

type PatternRow = {
  id: string;
  asset: string | null;
  timeframe: string;
  pattern_type: string;
  predicted_direction: string;
  candle_time: string | null;
  expiry_candles: number;
  entry_price: number | null;
  exit_price: number | null;
  outcome: string | null;
  sample_size: number | null;
  win_rate: number | null;
  confidence: number;
  details: unknown;
};

function fromRow(r: PatternRow): Signal | null {
  if (!r.asset || !r.candle_time) return null;
  const d = (r.details ?? {}) as { strength?: number; stat?: Signal["stat"] };
  const s: Signal = {
    key: "",
    asset: r.asset,
    tf: parseInt(r.timeframe) || 1,
    pattern: r.pattern_type as PatternId,
    dir: r.predicted_direction as Dir,
    candleTime: new Date(r.candle_time).getTime(),
    expiry: r.expiry_candles,
    entry: Number(r.entry_price),
    strength: d.strength ?? 0,
    stat: d.stat ?? null,
    outcome: (r.outcome as Signal["outcome"]) ?? null,
    exit: r.exit_price === null ? null : Number(r.exit_price),
    id: r.id,
  };
  s.key = signalKey(s);
  return s;
}

/**
 * Watches for new finished candles, records the patterns on each one with
 * their track record, and marks each as win/loss once its expiry candle closes.
 */
export function useSignals(asset: string, tf: number, expiry: number, bars: Bar[], board: Scoreboard | null, onNew?: (s: Signal[]) => void) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const lastCandle = useRef<number | null>(null);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  // Earlier signals for this asset/size (track record survives reloads).
  useEffect(() => {
    let alive = true;
    lastCandle.current = null;
    setSignals([]);
    (async () => {
      const { data } = await supabase
        .from("pocketoption_patterns")
        .select("id, asset, timeframe, pattern_type, predicted_direction, candle_time, expiry_candles, entry_price, exit_price, outcome, sample_size, win_rate, confidence, details")
        .eq("asset", asset)
        .eq("timeframe", `${tf}m`)
        .not("candle_time", "is", null)
        .order("candle_time", { ascending: false })
        .limit(300);
      if (!alive || !data) return;
      const old = (data as PatternRow[]).map(fromRow).filter((s): s is Signal => !!s);
      setSignals((cur) => {
        const keys = new Set(cur.map((s) => s.key));
        return [...cur, ...old.filter((s) => !keys.has(s.key))].sort((a, b) => b.candleTime - a.candleTime);
      });
    })();
    return () => {
      alive = false;
    };
  }, [asset, tf]);

  // New finished candle: look for patterns on it.
  useEffect(() => {
    const last = bars[bars.length - 1];
    if (!last || !board) return;
    if (lastCandle.current === null) {
      // First look after loading: don't report old candles as new signals.
      lastCandle.current = last.time;
      return;
    }
    if (last.time <= lastCandle.current) return;
    lastCandle.current = last.time;
    // Only candles that just finished (not old ones filled in by a history load).
    if (Date.now() - last.time > (tf * 2 + 1) * 60_000) return;
    const fresh = signalsOnLast(asset, tf, bars, board, expiry);
    if (!fresh.length) return;
    setSignals((cur) => {
      const keys = new Set(cur.map((s) => s.key));
      const add = fresh.filter((s) => !keys.has(s.key));
      return add.length ? [...add, ...cur].slice(0, 500) : cur;
    });
    onNewRef.current?.(fresh);
    void saveSignals(fresh, tf);
  }, [bars, board, asset, tf, expiry]);

  // Outcomes as expiry candles close.
  useEffect(() => {
    setSignals((cur) => {
      const next = resolveSignals(cur, bars);
      if (next !== cur) {
        const done = next.filter((s, i) => s.outcome && !cur[i].outcome);
        void saveOutcomes(done, tf);
      }
      return next;
    });
  }, [bars, tf]);

  return signals;
}

async function saveSignals(list: Signal[], tf: number) {
  const uid = (await supabase.auth.getSession()).data.session?.user.id;
  if (!uid) return;
  const rows = list.map((s) => ({
    user_id: uid,
    pair: s.asset,
    asset: s.asset,
    timeframe: `${tf}m`,
    pattern_type: s.pattern,
    predicted_direction: s.dir,
    candle_time: new Date(s.candleTime).toISOString(),
    predicted_at: new Date().toISOString(),
    expires_at: new Date(s.candleTime + (s.expiry + 1) * tf * 60_000).toISOString(),
    expiry_candles: s.expiry,
    entry_price: s.entry,
    confidence: Math.round((s.stat?.winRate ?? 0.5) * 100),
    accuracy_rate: Math.round((s.stat?.floor ?? 0) * 100),
    sample_size: s.stat?.n ?? 0,
    win_rate: s.stat ? Math.round(s.stat.winRate * 1000) / 10 : null,
    details: { strength: s.strength, stat: s.stat },
  }));
  const { error } = await supabase.from("pocketoption_patterns").upsert(rows, { onConflict: "user_id,asset,timeframe,pattern_type,candle_time,expiry_candles", ignoreDuplicates: true });
  if (error) console.warn("[patterns] save failed:", error.message);
}

async function saveOutcomes(list: Signal[], tf: number) {
  const uid = (await supabase.auth.getSession()).data.session?.user.id;
  if (!uid || !list.length) return;
  for (const s of list) {
    const { error } = await supabase
      .from("pocketoption_patterns")
      .update({ outcome: s.outcome, exit_price: s.exit, resolved_at: new Date().toISOString() })
      .eq("user_id", uid)
      .eq("asset", s.asset)
      .eq("timeframe", `${tf}m`)
      .eq("pattern_type", s.pattern)
      .eq("candle_time", new Date(s.candleTime).toISOString())
      .eq("expiry_candles", s.expiry);
    if (error) console.warn("[patterns] outcome save failed:", error.message);
  }
}

/* ---- background collection --------------------------------------------- */

export interface WatchRow {
  asset: string;
  enabled: boolean;
  last_run_at: string | null;
  last_candle_at: string | null;
  last_count: number | null;
  last_error: string | null;
}

export function useWatch(asset: string) {
  const [row, setRow] = useState<WatchRow | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const { data } = await supabase.from("pocketoption_watch").select("asset, enabled, last_run_at, last_candle_at, last_count, last_error").eq("asset", asset).maybeSingle();
    setRow((data as WatchRow) ?? null);
  }, [asset]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      const uid = (await supabase.auth.getSession()).data.session?.user.id;
      if (!uid) return;
      setRow((r) => ({ ...(r ?? { asset, last_run_at: null, last_candle_at: null, last_count: null, last_error: null }), enabled }));
      await supabase.from("pocketoption_watch").upsert({ user_id: uid, asset, enabled }, { onConflict: "user_id,asset" });
      await refresh();
    },
    [asset, refresh],
  );

  /** Run the collector now for this asset (server side). */
  const collectNow = useCallback(async (): Promise<{ saved: number; error?: string }> => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("collect-pocketoption-candles", { body: { asset } });
      if (error) return { saved: 0, error: error.message };
      const mine = (data?.assets as Array<{ asset: string; saved: number; error?: string }> | undefined)?.find((a) => a.asset === asset);
      return { saved: mine?.saved ?? data?.saved ?? 0, error: mine?.error ?? data?.error };
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [asset, refresh]);

  return { row, busy, setEnabled, collectNow, refresh };
}

/* ---- next-candle forecast ----------------------------------------------- */

export interface ForecastEntry extends Forecast {
  key: string;
  result: ForecastResult | null;
}

const forecastKey = (f: Pick<Forecast, "asset" | "tf" | "start" | "expiry">) => `${f.asset}|${f.tf}|${f.start}|${f.expiry}`;

type PredictionRow = {
  pair: string;
  timeframe: string;
  candle_time: string | null;
  expiry_candles: number;
  predicted_direction: string;
  p_up: number | null;
  made_call: boolean;
  confidence: number;
  actual_direction: string | null;
  was_correct: boolean | null;
  evidence: unknown;
};

function entryFromRow(r: PredictionRow): ForecastEntry | null {
  if (!r.candle_time) return null;
  const tf = parseInt(r.timeframe) || 1;
  const start = new Date(r.candle_time).getTime();
  const ev = (r.evidence ?? {}) as { entry?: number; reason?: string; strength?: Forecast["strength"]; items?: Forecast["evidence"]; breakEven?: number };
  const dir = r.predicted_direction as Dir;
  const pUp = r.p_up === null ? (dir === "up" ? r.confidence / 100 : 1 - r.confidence / 100) : Number(r.p_up);
  const f: ForecastEntry = {
    key: "",
    asset: r.pair,
    tf,
    expiry: r.expiry_candles,
    start,
    end: start + r.expiry_candles * tf * 60_000,
    entry: ev.entry ?? 0,
    pUp,
    call: r.made_call ? dir : null,
    lean: dir,
    confidence: Math.max(pUp, 1 - pUp),
    breakEven: ev.breakEven ?? 0.52,
    strength: ev.strength ?? "none",
    evidence: ev.items ?? [],
    reason: ev.reason ?? "",
    result: r.was_correct === null || !r.actual_direction ? null : { actual: r.actual_direction as ForecastResult["actual"], exit: 0, correct: r.was_correct },
  };
  f.key = forecastKey(f);
  return f;
}

/**
 * Predicts the next candle each time one closes (red or green, for that
 * exact time), saves the prediction, and checks it when that candle closes.
 */
export function useForecast(asset: string, tf: number, expiry: number, payout: number, bars: Bar[], board: Scoreboard | null) {
  const [entries, setEntries] = useState<ForecastEntry[]>([]);
  const lastStart = useRef<number>(0);

  // Earlier forecasts for this asset (the record survives reloads).
  useEffect(() => {
    let alive = true;
    lastStart.current = 0;
    setEntries([]);
    (async () => {
      const { data } = await supabase
        .from("pocketoption_predictions")
        .select("pair, timeframe, candle_time, expiry_candles, predicted_direction, p_up, made_call, confidence, actual_direction, was_correct, evidence")
        .eq("pair", asset)
        .eq("timeframe", `${tf}m`)
        .eq("expiry_candles", expiry)
        .not("candle_time", "is", null)
        .order("candle_time", { ascending: false })
        .limit(200);
      if (!alive || !data) return;
      const old = (data as PredictionRow[]).map(entryFromRow).filter((e): e is ForecastEntry => !!e);
      setEntries((cur) => {
        const keys = new Set(cur.map((e) => e.key));
        return [...cur, ...old.filter((e) => !keys.has(e.key))].sort((a, b) => b.start - a.start);
      });
    })();
    return () => {
      alive = false;
    };
  }, [asset, tf, expiry]);

  // A candle just closed: forecast the next one.
  useEffect(() => {
    const last = bars[bars.length - 1];
    if (!last || !board) return;
    const start = last.time + tf * 60_000;
    if (start <= lastStart.current) return;
    // Only for the candle happening now (not old candles filled in by a history load).
    if (Date.now() > start + tf * 60_000) return;
    lastStart.current = start;
    const f = forecastNext(asset, bars, board, { expiry, payout, tf });
    if (!f) return;
    const e: ForecastEntry = { ...f, key: forecastKey(f), result: null };
    setEntries((cur) => (cur.some((x) => x.key === e.key) ? cur : [e, ...cur].slice(0, 300)));
    void saveForecast(e);
  }, [bars, board, asset, tf, expiry, payout]);

  // Check forecasts whose candle has closed.
  useEffect(() => {
    setEntries((cur) => {
      let changed = false;
      const next = cur.map((e) => {
        if (e.result || !e.entry) return e;
        const r = resolveForecast(e, bars);
        if (!r) return e;
        changed = true;
        void saveForecastResult(e, r);
        return { ...e, result: r };
      });
      return changed ? next : cur;
    });
  }, [bars]);

  const current = entries[0] && Date.now() < entries[0].end + 5 * 60_000 ? entries[0] : null;
  const record = useMemo(() => {
    const done = entries.filter((e) => e.result && e.result.actual !== "flat");
    const calls = done.filter((e) => e.call);
    const right = calls.filter((e) => e.result!.correct).length;
    const leans = done.filter((e) => !e.call);
    return { calls: calls.length, right, rate: calls.length ? right / calls.length : 0, leans: leans.length, leansRight: leans.filter((e) => e.result!.correct).length };
  }, [entries]);
  return { current, entries, record };
}

async function saveForecast(e: ForecastEntry) {
  const uid = (await supabase.auth.getSession()).data.session?.user.id;
  if (!uid) return;
  const { error } = await supabase.from("pocketoption_predictions").upsert(
    {
      user_id: uid,
      pair: e.asset,
      timeframe: `${e.tf}m`,
      candle_time: new Date(e.start).toISOString(),
      expiry_candles: e.expiry,
      predicted_direction: e.call ?? e.lean,
      made_call: !!e.call,
      p_up: Math.round(e.pUp * 1000) / 1000,
      confidence: Math.round(e.confidence * 100),
      prediction_method: "patterns",
      sequence_used: e.reason.slice(0, 500),
      evidence: { entry: e.entry, reason: e.reason, strength: e.strength, items: e.evidence, breakEven: e.breakEven } as unknown as Json,
    },
    { onConflict: "user_id,pair,timeframe,candle_time,expiry_candles", ignoreDuplicates: true },
  );
  if (error) console.warn("[forecast] save failed:", error.message);
}

async function saveForecastResult(e: ForecastEntry, r: ForecastResult) {
  const uid = (await supabase.auth.getSession()).data.session?.user.id;
  if (!uid) return;
  const { error } = await supabase
    .from("pocketoption_predictions")
    .update({ actual_direction: r.actual === "flat" ? "neutral" : r.actual, was_correct: r.correct, verified_at: new Date().toISOString() })
    .eq("user_id", uid)
    .eq("pair", e.asset)
    .eq("timeframe", `${e.tf}m`)
    .eq("candle_time", new Date(e.start).toISOString())
    .eq("expiry_candles", e.expiry);
  if (error) console.warn("[forecast] result save failed:", error.message);
}
