/**
 * Runs a user's indicator script. Used inside the sandbox worker (and by
 * tests directly). The script is the body of a function:
 *
 *   const fast = ta.ema(bars.close, input("Fast", 9));
 *   const slow = ta.ema(bars.close, input("Slow", 21));
 *   plot("Fast", fast);
 *   plot("Slow", slow);
 *   plot("Spread", fast.map((f, i) => f - slow[i]), { type: "histogram" });
 *
 * - bars: { timestamp, open, high, low, close, volume } arrays, oldest first
 * - input(name, default): a number setting the user can change
 * - plot(title, series, { type: "line" | "histogram" }): up to 8 per indicator
 * - ta: the app's indicator math (sma, ema, rsiSeries, macd, atr, vwap, bollinger…)
 *   plus helpers: shift, crossover, crossunder, highest, lowest, nz
 */
import * as calc from "../../../../supabase/functions/_shared/indicator-calc";

export interface ScriptBars {
  timestamp: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

export interface PlotResult {
  title: string;
  type: "line" | "bar";
  values: number[];
}

export interface ExecResult {
  plots: PlotResult[];
  inputs: Array<{ name: string; default: number }>;
}

export const MAX_PLOTS = 8;
export const MAX_CODE_LENGTH = 20_000;

const toNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

/** Extra helpers that make common scripts short. All return plain arrays. */
export const helpers = {
  /** Value `n` bars ago. */
  shift: (src: number[], n = 1) => src.map((_, i) => (i - n >= 0 && i - n < src.length ? src[i - n] : NaN)),
  /** 1 on the bar where a crosses above b, else 0. */
  crossover: (a: number[], b: number[] | number) => a.map((v, i) => {
    const bi = typeof b === "number" ? b : b[i];
    const bp = typeof b === "number" ? b : b[i - 1];
    return i > 0 && a[i - 1] <= bp && v > bi ? 1 : 0;
  }),
  /** 1 on the bar where a crosses below b, else 0. */
  crossunder: (a: number[], b: number[] | number) => a.map((v, i) => {
    const bi = typeof b === "number" ? b : b[i];
    const bp = typeof b === "number" ? b : b[i - 1];
    return i > 0 && a[i - 1] >= bp && v < bi ? 1 : 0;
  }),
  highest: (src: number[], n: number) => calc.rollingMax(src, n),
  lowest: (src: number[], n: number) => calc.rollingMin(src, n),
  /** Replace missing values with `v` (default 0). */
  nz: (src: number[], v = 0) => src.map((x) => (Number.isFinite(x) ? x : v)),
};

export class ScriptError extends Error {}

export function executeScript(code: string, bars: ScriptBars, inputValues: Record<string, number> = {}): ExecResult {
  if (typeof code !== "string" || !code.trim()) throw new ScriptError("The script is empty.");
  if (code.length > MAX_CODE_LENGTH) throw new ScriptError(`The script is too long (max ${MAX_CODE_LENGTH} characters).`);
  const n = bars.close.length;
  const plots: PlotResult[] = [];
  const inputs: Array<{ name: string; default: number }> = [];

  const input = (name: unknown, def: unknown) => {
    if (typeof name !== "string" || !name.trim()) throw new ScriptError("input(name, default): name must be text.");
    if (typeof def !== "number" || !Number.isFinite(def)) throw new ScriptError(`input("${name}"): default must be a number.`);
    if (!inputs.some((x) => x.name === name)) inputs.push({ name, default: def });
    const v = inputValues[name];
    return typeof v === "number" && Number.isFinite(v) ? v : def;
  };

  const plot = (title: unknown, series: unknown, opts?: { type?: string }) => {
    if (typeof title !== "string" || !title.trim()) throw new ScriptError("plot(title, series): title must be text.");
    if (plots.length >= MAX_PLOTS) throw new ScriptError(`At most ${MAX_PLOTS} plots per indicator.`);
    let values: number[];
    if (typeof series === "number") values = new Array(n).fill(toNum(series));
    else if (series && typeof (series as ArrayLike<number>).length === "number") {
      const s = series as ArrayLike<unknown>;
      if (s.length !== n) throw new ScriptError(`plot("${title}"): series has ${s.length} values, expected ${n} (one per bar).`);
      values = Array.from({ length: n }, (_, i) => toNum(s[i]));
    } else throw new ScriptError(`plot("${title}"): series must be a list of numbers (one per bar) or a single number.`);
    plots.push({ title: title.trim().slice(0, 40), type: opts?.type === "histogram" || opts?.type === "bar" ? "bar" : "line", values });
  };

  // Fresh copies so a script can't change the chart's own data.
  const b = Object.freeze({
    timestamp: bars.timestamp.slice(), open: bars.open.slice(), high: bars.high.slice(),
    low: bars.low.slice(), close: bars.close.slice(), volume: bars.volume.slice(),
  });
  const ta = Object.freeze({ ...calc, ...helpers });

  let fn: (...args: unknown[]) => unknown;
  try {
    fn = new Function("bars", "input", "plot", "ta", `"use strict";\n${code}`) as typeof fn;
  } catch (e) {
    throw new ScriptError(`Syntax error: ${(e as Error).message}`);
  }
  try {
    fn(b, input, plot, ta);
  } catch (e) {
    if (e instanceof ScriptError) throw e;
    throw new ScriptError(`Error while running: ${(e as Error)?.message ?? String(e)}`);
  }
  if (plots.length === 0) throw new ScriptError('Nothing to draw: call plot("Name", series) at least once.');
  return { plots, inputs };
}
