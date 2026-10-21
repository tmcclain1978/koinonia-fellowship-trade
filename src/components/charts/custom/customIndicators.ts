/**
 * Custom indicators: definitions (saved with the chart preferences, so they
 * follow the user to other devices) and their chart templates.
 */
import { registerIndicator, type KLineData } from "klinecharts";
import { toBars } from "../../../../supabase/functions/_shared/indicator-calc";
import { MAX_CODE_LENGTH, MAX_PLOTS, type ScriptBars } from "./customExec";
import { sharedRunner, type ScriptRunner } from "./customRunner";

export interface CustomPlot {
  title: string;
  type: "line" | "bar";
}

export interface CustomInput {
  name: string;
  value: number;
}

export interface CustomIndicatorDef {
  id: string;
  name: string;
  /** true = drawn on the price chart; false = its own pane. */
  overlay: boolean;
  code: string;
  /** Discovered by the test run when saved. */
  plots: CustomPlot[];
  inputs: CustomInput[];
  updatedAt: number;
}

export const MAX_CUSTOM = 30;
export const CUSTOM_PREFIX = "custom:";
export const templateName = (id: string) => `KF_CUSTOM_${id}`;

/** Keep only well-formed definitions (old versions, cloud data, hand edits). */
export function normalizeCustom(raw: unknown): CustomIndicatorDef[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomIndicatorDef[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const d = r as Partial<CustomIndicatorDef>;
    if (typeof d.id !== "string" || !/^[a-z0-9]{4,24}$/.test(d.id)) continue;
    if (typeof d.code !== "string" || d.code.length > MAX_CODE_LENGTH) continue;
    const plots = Array.isArray(d.plots)
      ? d.plots.filter((p) => p && typeof p.title === "string").slice(0, MAX_PLOTS).map((p) => ({ title: p.title.slice(0, 40), type: p.type === "bar" ? ("bar" as const) : ("line" as const) }))
      : [];
    if (!plots.length) continue;
    const inputs = Array.isArray(d.inputs)
      ? d.inputs.filter((i) => i && typeof i.name === "string" && Number.isFinite(i.value)).slice(0, 20).map((i) => ({ name: i.name.slice(0, 40), value: Number(i.value) }))
      : [];
    out.push({
      id: d.id,
      name: typeof d.name === "string" && d.name.trim() ? d.name.trim().slice(0, 40) : "Custom",
      overlay: d.overlay === true,
      code: d.code,
      plots,
      inputs,
      updatedAt: Number(d.updatedAt) || 0,
    });
    if (out.length >= MAX_CUSTOM) break;
  }
  return out;
}

export const newCustomId = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

/* ----------------------------------------------------------------------------
 * Starters shown in the editor
 * ------------------------------------------------------------------------- */

export const STARTERS: Array<{ name: string; overlay: boolean; code: string }> = [
  {
    name: "EMA cross",
    overlay: true,
    code: `// Two moving averages. Change the numbers with the inputs below.
const fast = ta.ema(bars.close, input("Fast", 9));
const slow = ta.ema(bars.close, input("Slow", 21));
plot("Fast EMA", fast);
plot("Slow EMA", slow);`,
  },
  {
    name: "RSI with a smoothed line",
    overlay: false,
    code: `const rsi = ta.rsiSeries(bars.close, input("Length", 14));
plot("RSI", rsi);
plot("Smoothed", ta.sma(rsi, input("Smoothing", 5)));
plot("Overbought", 70);
plot("Oversold", 30);`,
  },
  {
    name: "Volume vs. normal (z-score)",
    overlay: false,
    code: `// How unusual is this bar's volume? 0 = normal, 2 = very high.
const n = input("Lookback", 20);
const avg = ta.sma(bars.volume, n);
const sd = ta.stdev(bars.volume, n);
plot("Volume z", bars.volume.map((v, i) => (v - avg[i]) / sd[i]), { type: "histogram" });`,
  },
  {
    name: "Distance from VWAP (%)",
    overlay: false,
    code: `const vw = ta.vwap(bars).value;
plot("% from VWAP", bars.close.map((c, i) => ((c - vw[i]) / vw[i]) * 100), { type: "histogram" });`,
  },
];

/* ----------------------------------------------------------------------------
 * Chart templates
 * ------------------------------------------------------------------------- */

export function toScriptBars(list: KLineData[]): ScriptBars {
  const b = toBars(list);
  return { timestamp: b.timestamp, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
}

const UP = "#26a69a";
const DOWN = "#ef5350";
const registeredVersion = new Map<string, string>();
/** Last error per indicator, for the panel to show. */
export const customErrors = new Map<string, string>();

/**
 * Register (or update) the chart template for each definition. Calculation
 * runs in the sandbox; while one run is in flight, later ticks reuse it.
 */
export function registerCustomIndicators(defs: CustomIndicatorDef[], runner: () => ScriptRunner = sharedRunner): void {
  for (const def of defs) {
    const version = JSON.stringify([def.code, def.plots, def.inputs, def.overlay, def.name]);
    if (registeredVersion.get(def.id) === version) continue;
    registeredVersion.set(def.id, version);
    customErrors.delete(def.id);
    let inFlight: Promise<Array<Record<string, number | undefined>>> | null = null;
    let broken = false;
    registerIndicator<Record<string, number | undefined>, number>({
      name: templateName(def.id),
      shortName: def.name,
      series: (def.overlay ? "price" : "normal") as never,
      precision: 2,
      calcParams: def.inputs.map((i) => i.value),
      figures: def.plots.map((p, k) =>
        p.type === "bar"
          ? {
              key: `p${k}`, title: `${p.title}: `, type: "bar", baseValue: 0,
              styles: ({ data }: { data: { current?: Record<string, number | undefined> | null } }) => {
                const v = data.current?.[`p${k}`] ?? 0;
                const color = v >= 0 ? UP : DOWN;
                return { style: "fill", color, borderColor: color } as never;
              },
            }
          : { key: `p${k}`, title: `${p.title}: `, type: "line" },
      ) as never,
      calc: (dataList: KLineData[], indicator) => {
        if (broken || dataList.length === 0) return dataList.map(() => ({}));
        // A run is already going (e.g. a fast stream of ticks): reuse it, sized to the current bars.
        if (inFlight) return inFlight.then((rows) => dataList.map((_, i) => rows[i] ?? {}));
        const params = indicator.calcParams as number[];
        const inputs = Object.fromEntries(def.inputs.map((inp, i) => [inp.name, Number.isFinite(params?.[i]) ? params[i] : inp.value]));
        inFlight = runner()
          .run(def.code, toScriptBars(dataList), inputs)
          .then((res) =>
            dataList.map((_, i) => {
              const row: Record<string, number | undefined> = {};
              def.plots.forEach((p, k) => {
                const series = res.plots.find((x) => x.title === p.title) ?? res.plots[k];
                const v = series?.values[i];
                if (Number.isFinite(v)) row[`p${k}`] = v;
              });
              return row;
            }),
          )
          .catch((e: Error) => {
            // Stop retrying a failing script until it's edited.
            broken = true;
            customErrors.set(def.id, e.message);
            console.warn(`[custom indicator ${def.name}]`, e.message);
            return dataList.map(() => ({}));
          })
          .finally(() => {
            inFlight = null;
          });
        return inFlight;
      },
    });
  }
}

/** Sample bars for the editor preview (deterministic, ~2 days of 5-minute bars). */
export function sampleBars(n = 160): ScriptBars {
  let s = 42;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const out: ScriptBars = { timestamp: [], open: [], high: [], low: [], close: [], volume: [] };
  let p = 100;
  const t0 = Date.UTC(2026, 9, 19, 13, 30);
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = o + Math.sin(i / 9) * 0.35 + (rnd() - 0.48) * 0.5;
    out.timestamp.push(t0 + i * 300_000);
    out.open.push(o);
    out.close.push(c);
    out.high.push(Math.max(o, c) + rnd() * 0.3);
    out.low.push(Math.min(o, c) - rnd() * 0.3);
    out.volume.push(Math.round(20_000 + rnd() * 40_000 + (Math.abs(c - o) > 0.4 ? 30_000 : 0)));
    p = c;
  }
  return out;
}
