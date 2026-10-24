/**
 * The multi-pair signal scanner, wired to PocketOption and the database.
 * One instance for the app, so it keeps scanning while you switch tabs.
 */
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { poClient } from "@/hooks/usePocketOptionWebSocket";
import { candleStore, saveForecast, saveForecastResult } from "@/hooks/usePatternEngine";
import { SignalScanner, type ScanSignal, signalKey } from "@/lib/pocketoption/scanner";
import type { Dir } from "../../supabase/functions/_shared/patterns/detect";

/** "AUDJPY_otc" -> "AUD/JPY OTC" (PocketOption's own name when known). */
export function assetName(asset: string): string {
  const known = poClient.getSnapshot().assets.find((a) => a.asset === asset);
  if (known) return known.name;
  const m = asset.match(/^([A-Z]{3})([A-Z]{3})(_otc)?$/);
  return m ? `${m[1]}/${m[2]}${m[3] ? " OTC" : ""}` : asset;
}

// Older candles from history loads go into the store even when no chart is open.
poClient.onHistoryPage((asset, candles) => {
  const minuteStart = Math.floor(Date.now() / 60_000) * 60_000;
  candleStore.add(asset, candles.filter((c) => c.time < minuteStart));
});

export const scanner = new SignalScanner({
  ready: () => poClient.ready,
  fetchLatest: (asset) => poClient.fetchLatest(asset),
  loadHistory: async (asset, days) => {
    const r = await poClient.loadHistoryAndWait(asset, days);
    await candleStore.flush();
    return { loaded: r.loaded, ...(r.error ? { error: r.error } : {}) };
  },
  store: {
    load: (asset) => candleStore.load(asset),
    bars: (asset) => candleStore.get(asset).bars,
    add: (asset, bars) => candleStore.add(asset, bars),
  },
  payout: (asset) => poClient.getSnapshot().assets.find((a) => a.asset === asset)?.payout || 80,
  name: assetName,
  save: (s) => saveForecast(s, s.source === "time" ? "scanner-time" : "scanner-pattern"),
  saveResult: (s, r) => saveForecastResult(s, r),
});

type Row = {
  pair: string;
  candle_time: string | null;
  expiry_candles: number;
  timeframe: string;
  predicted_direction: string;
  p_up: number | null;
  confidence: number;
  prediction_method: string;
  actual_direction: string | null;
  was_correct: boolean | null;
  evidence: unknown;
};

/** Today's scanner predictions from the database (the list survives a reload). */
async function loadToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("pocketoption_predictions")
    .select("pair, candle_time, expiry_candles, timeframe, predicted_direction, p_up, confidence, prediction_method, actual_direction, was_correct, evidence")
    .like("prediction_method", "scanner%")
    .eq("made_call", true)
    .gte("candle_time", start.toISOString())
    .order("candle_time", { ascending: false })
    .limit(500);
  const list: ScanSignal[] = [];
  for (const r of (data ?? []) as Row[]) {
    if (!r.candle_time) continue;
    const tf = parseInt(r.timeframe) || 1;
    const startMs = new Date(r.candle_time).getTime();
    const dir = r.predicted_direction as Dir;
    const ev = (r.evidence ?? {}) as { reason?: string; strength?: "strong" | "moderate"; items?: ScanSignal["evidence"]; breakEven?: number; entry?: number };
    const pUp = r.p_up === null ? 0.5 : Number(r.p_up);
    const sig: ScanSignal = {
      key: "",
      asset: r.pair,
      name: assetName(r.pair),
      source: r.prediction_method === "scanner-time" ? "time" : "pattern",
      tf,
      expiry: r.expiry_candles,
      start: startMs,
      end: startMs + r.expiry_candles * tf * 60_000,
      entry: ev.entry ?? 0,
      pUp,
      call: dir,
      lean: dir,
      confidence: r.confidence / 100,
      breakEven: ev.breakEven ?? 0.52,
      strength: ev.strength ?? "moderate",
      evidence: ev.items ?? [],
      reason: ev.reason ?? "",
      result: r.was_correct === null || !r.actual_direction ? null : { actual: r.actual_direction === "neutral" ? "flat" : (r.actual_direction as "up" | "down"), exit: 0, correct: r.was_correct },
    };
    sig.key = signalKey(sig);
    list.push(sig);
  }
  return list;
}

let seeded = false;

export function useSignalScanner() {
  const snap = useSyncExternalStore(scanner.subscribe, scanner.getSnapshot);
  useEffect(() => {
    if (seeded) return;
    seeded = true;
    void loadToday().then((l) => scanner.seed(l));
  }, []);
  return snap;
}

/* ---- alerts (work on any tab while the scanner runs) --------------------- */

let alertsOn = (() => {
  try {
    return localStorage.getItem("po-signals:alerts") !== "false";
  } catch {
    return true;
  }
})();
export const setSignalAlerts = (v: boolean) => {
  alertsOn = v;
};

const alerted = new Set<string>();
const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 988;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.3);
  } catch {
    /* no audio */
  }
}

/** Heads-up 15 s before a time-of-day prediction; pattern predictions (made at the candle start) right away. */
export function dueAlerts(signals: ScanSignal[], now: number, seen: Set<string>): ScanSignal[] {
  const out: ScanSignal[] = [];
  for (const s of signals) {
    if (seen.has(s.key) || s.result) continue;
    const lead = s.start - now;
    const due = s.source === "time" ? lead <= 15_000 && lead > -5_000 : lead <= 0 && now - s.start < 20_000;
    if (!due) continue;
    seen.add(s.key);
    out.push(s);
  }
  return out;
}

if (typeof window !== "undefined") {
  setInterval(() => {
    const snap = scanner.getSnapshot();
    if (!snap.running || !alertsOn) return;
    for (const s of dueAlerts(snap.signals, Date.now(), alerted)) {
      beep();
      const lead = s.start - Date.now();
      toast(`${s.name} - ${hhmm(s.start)} -> ${s.call === "up" ? "CALL ▲" : "PUT ▼"}`, { description: `${lead > 1000 ? `Starts in ${Math.round(lead / 1000)}s. ` : ""}${s.reason}` });
    }
  }, 1000);
}
