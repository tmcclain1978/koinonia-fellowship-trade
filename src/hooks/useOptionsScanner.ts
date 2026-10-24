/**
 * Options Signals, wired to Schwab (candles + option chains) and the database.
 * One scanner for the app, so it keeps watching while you use other screens.
 */
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { normalizeBars } from "@/lib/marketData/history";
import { OptionsScanner, type OptionSignal, optionKey } from "@/lib/options/scanner";
import type { ChainRow, ContractPick } from "@/lib/options/contractPicker";
import type { Bar } from "../../supabase/functions/_shared/patterns/detect";
import type { Mode, MoveOutcome } from "../../supabase/functions/_shared/patterns/moves";
import { isRegularSessionTime } from "../../supabase/functions/_shared/candle-buckets";

const REAL = new Set(["schwab", "polygon", "alphavantage"]);
const DAY = 86_400_000;

async function candles(symbol: string, interval: string, startMs?: number): Promise<Bar[]> {
  const body: Record<string, unknown> = { symbol, interval };
  if (startMs) {
    body.startDate = new Date(startMs).toISOString();
    body.endDate = new Date().toISOString();
  }
  const { data, error } = await supabase.functions.invoke("fetch-schwab-candles", { body });
  if (error) throw new Error(error.message || "Couldn't reach the price service");
  if (!REAL.has(String(data?.source ?? ""))) throw new Error(data?.error || `No price history for ${symbol}`);
  return normalizeBars(data?.data ?? data?.candles).map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
}

export const optionsScanner = new OptionsScanner({
  // 5-minute: as far back as the source allows (asks for ~6 months); daily: 8 years.
  history: async (symbol, mode) =>
    mode === "sameday"
      ? (await candles(symbol, "5", Date.now() - 180 * DAY)).filter((b) => isRegularSessionTime(b.time))
      : await candles(symbol, "D", Date.now() - 8 * 365 * DAY),
  latest: async (symbol) => (await candles(symbol, "5")).filter((b) => isRegularSessionTime(b.time)),
  chain: async (symbol, mode) => {
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const { data, error } = await supabase.functions.invoke("fetch-schwab-options", {
      body: { symbol, fromDate: day(Date.now()), toDate: day(Date.now() + (mode === "sameday" ? 7 : 50) * DAY), strikeCount: 16 },
    });
    if (error) throw new Error(error.message);
    if (data?.source !== "schwab") return null;
    return { rows: (data.options ?? []) as ChainRow[], spot: Number(data.underlyingPrice) || 0 };
  },
  econEvents: async (from, to) => {
    const { data, error } = await supabase.functions.invoke("fetch-economic-calendar", {
      body: { startDate: new Date(from).toISOString(), endDate: new Date(to).toISOString(), countries: ["US"], importance: ["high"] },
    });
    if (error || data?.source !== "fmp") return null;
    return data.events ?? [];
  },
  earnings: async (symbols) => {
    const { data, error } = await supabase.functions.invoke("fetch-earnings-calendar", { body: { symbols } });
    if (error || data?.source !== "fmp") return null;
    return data.earnings ?? [];
  },
  save: async (s) => {
    const uid = (await supabase.auth.getSession()).data.session?.user.id;
    if (!uid) return;
    const { error } = await supabase.from("options_predictions").upsert(
      {
        user_id: uid,
        symbol: s.symbol,
        mode: s.mode,
        direction: s.dir,
        signal_at: new Date(s.at).toISOString(),
        deadline: new Date(s.until).toISOString(),
        entry_price: s.entry,
        target_price: s.target,
        stop_price: s.stop,
        atr: s.atr,
        chance: Math.round(s.chance * 1000) / 1000,
        baseline: Math.round(s.baseline * 1000) / 1000,
        strength: s.strength,
        reason: s.reason,
        evidence: s.evidence as unknown as Json,
        contract: (s.contract ?? (s.contractNote ? { note: s.contractNote } : null)) as unknown as Json,
        partial_price: s.partial ?? null,
        context: (s.context ?? null) as unknown as Json,
      },
      { onConflict: "user_id,symbol,mode,signal_at", ignoreDuplicates: true },
    );
    if (error) console.warn("[options] save failed:", error.message);
  },
  saveResult: async (s) => {
    const uid = (await supabase.auth.getSession()).data.session?.user.id;
    if (!uid) return;
    const { error } = await supabase
      .from("options_predictions")
      .update({ outcome: s.outcome, exit_price: s.exit, plan_r: s.planR ?? null, resolved_at: new Date().toISOString() })
      .eq("user_id", uid)
      .eq("symbol", s.symbol)
      .eq("mode", s.mode)
      .eq("signal_at", new Date(s.at).toISOString());
    if (error) console.warn("[options] result save failed:", error.message);
  },
});

type Row = {
  symbol: string;
  mode: string;
  direction: string;
  signal_at: string;
  deadline: string;
  entry_price: number;
  target_price: number;
  stop_price: number;
  atr: number | null;
  chance: number | null;
  baseline: number | null;
  strength: string | null;
  reason: string | null;
  evidence: unknown;
  contract: unknown;
  outcome: string | null;
  exit_price: number | null;
  partial_price: number | null;
  plan_r: number | null;
  context: unknown;
};

/** The last 30 days of predictions (open ones get checked once candles load). */
async function loadRecent(): Promise<OptionSignal[]> {
  const { data } = await supabase
    .from("options_predictions")
    .select("symbol, mode, direction, signal_at, deadline, entry_price, target_price, stop_price, atr, chance, baseline, strength, reason, evidence, contract, outcome, exit_price, partial_price, plan_r, context")
    .gte("signal_at", new Date(Date.now() - 30 * DAY).toISOString())
    .order("signal_at", { ascending: false })
    .limit(500);
  return ((data ?? []) as Row[]).map((r) => {
    const c = (r.contract ?? null) as (ContractPick & { note?: string }) | null;
    const s: OptionSignal = {
      key: "",
      symbol: r.symbol,
      mode: r.mode as Mode,
      dir: r.direction as "up" | "down",
      entry: Number(r.entry_price),
      at: new Date(r.signal_at).getTime(),
      until: new Date(r.deadline).getTime(),
      target: Number(r.target_price),
      stop: Number(r.stop_price),
      atr: Number(r.atr ?? 0),
      chance: Number(r.chance ?? 0),
      baseline: Number(r.baseline ?? 0),
      strength: (r.strength as "strong" | "moderate") ?? "moderate",
      evidence: (r.evidence ?? []) as OptionSignal["evidence"],
      reason: r.reason ?? "",
      contract: c && "side" in c ? c : null,
      ...(c?.note ? { contractNote: c.note } : {}),
      outcome: (r.outcome as MoveOutcome) ?? null,
      exit: r.exit_price === null ? null : Number(r.exit_price),
      ...(r.partial_price !== null ? { partial: Number(r.partial_price) } : {}),
      planR: r.plan_r === null ? null : Number(r.plan_r),
      ...(r.context ? { context: r.context as OptionSignal["context"] } : {}),
    };
    s.key = optionKey(s);
    return s;
  });
}

let seeded = false;

// Filters are remembered on this device.
try {
  const saved = localStorage.getItem("options-signals:filters");
  if (saved) optionsScanner.setFilters(JSON.parse(saved));
} catch {
  /* private mode */
}
export function setOptionFilters(f: Parameters<typeof optionsScanner.setFilters>[0]) {
  optionsScanner.setFilters(f);
  try {
    localStorage.setItem("options-signals:filters", JSON.stringify(optionsScanner.getSnapshot().filters));
  } catch {
    /* private mode */
  }
}

/* ---- alerts -------------------------------------------------------------- */
let alertsOn = (() => {
  try {
    return localStorage.getItem("options-signals:alerts") !== "false";
  } catch {
    return true;
  }
})();
export const setOptionAlerts = (v: boolean) => {
  alertsOn = v;
  try {
    localStorage.setItem("options-signals:alerts", String(v));
  } catch {
    /* private mode */
  }
};
export const optionAlertsOn = () => alertsOn;

optionsScanner.onSignal((s) => {
  if (!alertsOn) return;
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 740;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    /* no audio */
  }
  toast(`${s.symbol} ${s.dir === "up" ? "CALL ▲" : "PUT ▼"} (${s.mode === "sameday" ? "same day" : "swing"})`, {
    description: `${s.contract ? `${s.contract.label} · about $${s.contract.cost}. ` : ""}Target $${s.target.toFixed(2)}, stop $${s.stop.toFixed(2)}.`,
  });
});

export function useOptionsScanner() {
  const snap = useSyncExternalStore(optionsScanner.subscribe, optionsScanner.getSnapshot);
  useEffect(() => {
    if (seeded) return;
    seeded = true;
    void loadRecent().then((l) => optionsScanner.seed(l));
  }, []);
  return snap;
}
