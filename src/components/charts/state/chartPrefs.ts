/**
 * Chart preferences: one versioned object instead of 18 separate
 * localStorage keys. Shared by every chart on the page, saved locally right
 * away, and copied to the cloud (when available) so it follows the user to
 * other devices.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { IndicatorSettingsMap } from "@/types/indicator";
import { cloudLoad, cloudSave } from "./chartCloud";
import { normalizeCustom, type CustomIndicatorDef } from "../custom/customIndicators";

export type SignalLineStyle = "solid" | "dashed" | "dotted";
export type PriceScaleMode = "normal" | "logarithm" | "percentage";

export interface SignalStylePrefs {
  entryColor: string;
  stopColor: string;
  target1Color: string;
  target2Color: string;
  entryStyle: SignalLineStyle;
  stopStyle: SignalLineStyle;
  targetStyle: SignalLineStyle;
  entryWidth: number;
  stopWidth: number;
  targetWidth: number;
  priceLabels: boolean;
}

export interface OptionsLevelPrefs {
  enabled: boolean;
  expectedMove: boolean;
  gamma: boolean;
  profile: boolean;
  maxPain: boolean;
  unusual: boolean;
  /** Expiration for expected move / max pain ("" = nearest). */
  expiration: string;
}

export interface OrderFlowPrefs {
  /** Resting Level 2 orders over time, behind the candles. */
  heatmap: boolean;
  /** Circles for large trades (green = bought, red = sold). */
  bubbles: boolean;
  /** Bought x sold at each price inside a bar (zoom in to see). */
  footprint: boolean;
  /** Pane: bought minus sold per bar. */
  delta: boolean;
  /** Pane: running total of delta. */
  cvd: boolean;
  /** Depth ladder beside the chart. */
  dom: boolean;
  /** Shares for a "big" trade bubble; 0 = automatic. */
  bigPrint: number;
}

export interface ChartPrefs {
  indicators: string[];
  indicatorSettings: IndicatorSettingsMap;
  sessionDividers: boolean;
  volumeProfile: boolean;
  /** Price-axis padding in percent (lower = tighter). */
  yAxisScale: number;
  priceScale: PriceScaleMode;
  timeFormat: "12h" | "24h";
  /** Decimal places; -1 = automatic by price. */
  pricePrecision: number;
  /** Show orders and positions on the chart (Trading / Paper Trading pages). */
  tradeLines: boolean;
  /** Levels from the option chain (expected move, gamma, max pain…). */
  options: OptionsLevelPrefs;
  signal: SignalStylePrefs;
  /** Indicators the user wrote themselves (Indicators → Custom). */
  customIndicators: CustomIndicatorDef[];
  /** Order flow from Schwab Level 2 (heatmap, footprint, delta, depth ladder). */
  orderFlow: OrderFlowPrefs;
}

export const DEFAULT_PREFS: ChartPrefs = {
  indicators: [],
  indicatorSettings: {},
  sessionDividers: true,
  volumeProfile: false,
  yAxisScale: 10,
  priceScale: "normal",
  timeFormat: "12h",
  pricePrecision: -1,
  tradeLines: true,
  options: { enabled: false, expectedMove: true, gamma: true, profile: true, maxPain: true, unusual: true, expiration: "" },
  orderFlow: { heatmap: false, bubbles: false, footprint: false, delta: false, cvd: false, dom: false, bigPrint: 0 },
  signal: {
    entryColor: "#f97316",
    stopColor: "#3b82f6",
    target1Color: "#a855f7",
    target2Color: "#8b5cf6",
    entryStyle: "solid",
    stopStyle: "dashed",
    targetStyle: "dashed",
    entryWidth: 2,
    stopWidth: 2,
    targetWidth: 1,
    priceLabels: true,
  },
  customIndicators: [],
};

const STORAGE_KEY = "koinonia-chart-prefs-v2";
const CLOUD_KEY = "prefs";

/* ----------------------------------------------------------------------------
 * Validation & migration (pure, tested)
 * ------------------------------------------------------------------------- */

const isStyle = (v: unknown): v is SignalLineStyle => v === "solid" || v === "dashed" || v === "dotted";
const isColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v);
const clampNum = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Fill defaults and drop anything malformed (old versions, hand-edited storage, cloud data). */
export function normalizePrefs(raw: unknown): ChartPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ChartPrefs> & { signal?: Partial<SignalStylePrefs> };
  const d = DEFAULT_PREFS;
  const s = (r.signal ?? {}) as Partial<SignalStylePrefs>;
  return {
    indicators: Array.isArray(r.indicators) ? r.indicators.filter((x): x is string => typeof x === "string") : d.indicators,
    indicatorSettings: r.indicatorSettings && typeof r.indicatorSettings === "object" ? r.indicatorSettings : d.indicatorSettings,
    sessionDividers: typeof r.sessionDividers === "boolean" ? r.sessionDividers : d.sessionDividers,
    volumeProfile: typeof r.volumeProfile === "boolean" ? r.volumeProfile : d.volumeProfile,
    yAxisScale: clampNum(r.yAxisScale, 1, 50, d.yAxisScale),
    priceScale: r.priceScale === "logarithm" || r.priceScale === "percentage" ? r.priceScale : "normal",
    timeFormat: r.timeFormat === "24h" ? "24h" : "12h",
    pricePrecision: r.pricePrecision === -1 ? -1 : clampNum(r.pricePrecision, 0, 8, d.pricePrecision),
    tradeLines: typeof r.tradeLines === "boolean" ? r.tradeLines : d.tradeLines,
    options: (() => {
      const o = (r.options ?? {}) as Partial<OptionsLevelPrefs>;
      const b = (k: keyof Omit<OptionsLevelPrefs, "expiration">) => (typeof o[k] === "boolean" ? (o[k] as boolean) : d.options[k]);
      return {
        enabled: b("enabled"), expectedMove: b("expectedMove"), gamma: b("gamma"), profile: b("profile"), maxPain: b("maxPain"), unusual: b("unusual"),
        expiration: typeof o.expiration === "string" && /^(\d{4}-\d{2}-\d{2})?$/.test(o.expiration) ? o.expiration : "",
      };
    })(),
    signal: {
      entryColor: isColor(s.entryColor) ? s.entryColor : d.signal.entryColor,
      stopColor: isColor(s.stopColor) ? s.stopColor : d.signal.stopColor,
      target1Color: isColor(s.target1Color) ? s.target1Color : d.signal.target1Color,
      target2Color: isColor(s.target2Color) ? s.target2Color : d.signal.target2Color,
      entryStyle: isStyle(s.entryStyle) ? s.entryStyle : d.signal.entryStyle,
      stopStyle: isStyle(s.stopStyle) ? s.stopStyle : d.signal.stopStyle,
      targetStyle: isStyle(s.targetStyle) ? s.targetStyle : d.signal.targetStyle,
      entryWidth: clampNum(s.entryWidth, 1, 6, d.signal.entryWidth),
      stopWidth: clampNum(s.stopWidth, 1, 6, d.signal.stopWidth),
      targetWidth: clampNum(s.targetWidth, 1, 6, d.signal.targetWidth),
      priceLabels: typeof s.priceLabels === "boolean" ? s.priceLabels : d.signal.priceLabels,
    },
    customIndicators: normalizeCustom((r as { customIndicators?: unknown }).customIndicators),
    orderFlow: (() => {
      const o = (r.orderFlow ?? {}) as Partial<OrderFlowPrefs>;
      const b = (k: keyof Omit<OrderFlowPrefs, "bigPrint">) => (typeof o[k] === "boolean" ? (o[k] as boolean) : d.orderFlow[k]);
      return {
        heatmap: b("heatmap"), bubbles: b("bubbles"), footprint: b("footprint"), delta: b("delta"), cvd: b("cvd"), dom: b("dom"),
        bigPrint: Math.round(clampNum(o.bigPrint, 0, 10_000_000, d.orderFlow.bigPrint)),
      };
    })(),
  };
}

/** Read the old one-key-per-setting format (prochartkit-*). */
export function migrateLegacyPrefs(get: (key: string) => string | null): ChartPrefs | null {
  const k = (name: string) => get(`prochartkit-${name}`);
  const json = (name: string) => {
    const v = k(name);
    if (v === null) return undefined;
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  };
  const any = ["indicators", "indicator-settings", "yaxis-scale", "time-format", "price-precision", "signal-entry-color"].some(
    (n) => k(n) !== null,
  );
  if (!any) return null;
  const precision = k("price-precision");
  return normalizePrefs({
    indicators: json("indicators"),
    indicatorSettings: json("indicator-settings"),
    sessionDividers: json("session-dividers"),
    volumeProfile: json("volume-profile"),
    yAxisScale: k("yaxis-scale"),
    timeFormat: k("time-format"),
    pricePrecision: precision === null || precision === "auto" ? -1 : precision,
    signal: {
      entryColor: k("signal-entry-color"),
      stopColor: k("signal-stoploss-color"),
      target1Color: k("signal-target1-color"),
      target2Color: k("signal-target2-color"),
      entryStyle: k("signal-entry-style"),
      stopStyle: k("signal-stoploss-style"),
      targetStyle: k("signal-target-style"),
      entryWidth: k("signal-entry-thickness"),
      stopWidth: k("signal-stoploss-thickness"),
      targetWidth: k("signal-target-thickness"),
      priceLabels: json("signal-price-labels"),
    } as unknown as SignalStylePrefs,
  });
}

/* ----------------------------------------------------------------------------
 * Store
 * ------------------------------------------------------------------------- */

interface Stored {
  prefs: ChartPrefs;
  updatedAt: number;
}

const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

function loadLocal(): Stored {
  const raw = safeGet(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return { prefs: normalizePrefs(parsed.prefs), updatedAt: Number(parsed.updatedAt) || 0 };
    } catch {
      /* fall through */
    }
  }
  const legacy = migrateLegacyPrefs(safeGet);
  // updatedAt 0: a cloud copy (from another device) should win over migrated local values.
  return { prefs: legacy ?? DEFAULT_PREFS, updatedAt: 0 };
}

let state: Stored = typeof window === "undefined" ? { prefs: DEFAULT_PREFS, updatedAt: 0 } : loadLocal();
const listeners = new Set<() => void>();
let cloudChecked = false;

function commit(next: Stored, toCloud: boolean) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: keep in memory */
  }
  if (toCloud) cloudSave(CLOUD_KEY, next.prefs, next.updatedAt);
  listeners.forEach((l) => l());
}

export function getChartPrefs(): ChartPrefs {
  return state.prefs;
}

export function setChartPrefs(update: Partial<ChartPrefs> | ((prev: ChartPrefs) => ChartPrefs)): void {
  const next = typeof update === "function" ? update(state.prefs) : { ...state.prefs, ...update };
  commit({ prefs: normalizePrefs(next), updatedAt: Date.now() }, true);
}

export function setOptionsPrefs(update: Partial<OptionsLevelPrefs>): void {
  setChartPrefs((p) => ({ ...p, options: { ...p.options, ...update } }));
}

export function setOrderFlowPrefs(update: Partial<OrderFlowPrefs>): void {
  setChartPrefs((p) => ({ ...p, orderFlow: { ...p.orderFlow, ...update } }));
}

export function setSignalPrefs(update: Partial<SignalStylePrefs>): void {
  setChartPrefs((p) => ({ ...p, signal: { ...p.signal, ...update } }));
}

/** Once per page load: take the cloud copy if it's newer than the local one. */
async function syncFromCloud() {
  if (cloudChecked) return;
  cloudChecked = true;
  const remote = await cloudLoad<ChartPrefs>(CLOUD_KEY);
  if (remote && remote.updatedAt > state.updatedAt) {
    commit({ prefs: normalizePrefs(remote.value), updatedAt: remote.updatedAt }, false);
  } else if (!remote && state.updatedAt === 0 && safeGet(STORAGE_KEY) === null) {
    // First run after the upgrade: save the migrated settings in the new format.
    commit({ prefs: state.prefs, updatedAt: Date.now() }, true);
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useChartPrefs(): ChartPrefs {
  useEffect(() => {
    void syncFromCloud();
  }, []);
  return useSyncExternalStore(subscribe, getChartPrefs, getChartPrefs);
}
