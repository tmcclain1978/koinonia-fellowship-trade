/**
 * Price-axis tick labels at "nice" steps (1, 2, 5 × 10ⁿ), denser when the
 * axis is zoomed in. Only for the normal (linear) price scale; log and
 * percent scales use the library's own ticks.
 */
export interface TickParams {
  range: { from: number; to: number; realFrom: number; realRange: number };
  bounding: { height: number };
  defaultTicks: Array<{ coord: number; value: number | string; text: string }>;
}

const LABEL_MARGIN_PX = 10;

export const tickCountForScale = (scale: number) => (scale <= 5 ? 15 : scale <= 10 ? 12 : scale <= 20 ? 10 : scale <= 35 ? 8 : 6);

export function buildPriceTicks(params: TickParams, scale: number, precisionFor: (midPrice: number) => number) {
  const { range, bounding, defaultTicks } = params;
  const span = range.to - range.from;
  if (!Number.isFinite(span) || span <= 0 || !range.realRange || bounding.height <= 0) return defaultTicks;

  const baseStep = span / tickCountForScale(scale);
  const magnitude = Math.pow(10, Math.floor(Math.log10(baseStep)));
  const normalized = baseStep / magnitude;
  let step = normalized <= 1 ? magnitude : normalized <= 2 ? 2 * magnitude : normalized <= 5 ? 5 * magnitude : 10 * magnitude;
  if (scale <= 5 && step > 0.01) step = Math.max(0.01, step / 2);

  const precision = precisionFor((range.from + range.to) / 2);
  const stepDecimals = step < 0.001 ? 4 : step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  const decimals = Math.max(precision, stepDecimals);

  const ticks: TickParams["defaultTicks"] = [];
  const first = Math.ceil(range.from / step);
  const last = Math.floor(range.to / step);
  for (let i = first; i <= last && ticks.length < 100; i++) {
    const value = i * step; // multiply (not add) so floating-point error doesn't accumulate
    // Same formula as the library's YAxis.convertToPixel for a linear axis.
    const coord = Math.round((1 - (value - range.realFrom) / range.realRange) * bounding.height);
    if (coord < LABEL_MARGIN_PX || coord > bounding.height - LABEL_MARGIN_PX) continue;
    ticks.push({ coord, value, text: value.toFixed(decimals) });
  }
  return ticks.length > 1 ? ticks : defaultTicks;
}

/** Decimal places for prices: fixed, or automatic by price level when `setting` is -1. */
export function effectivePrecision(setting: number, price: number | null | undefined): number {
  if (setting !== -1) return setting;
  if (!price) return 2;
  if (price < 0.01) return 6; // micro-penny
  if (price < 0.1) return 5;
  if (price < 1) return 4; // under $1
  if (price < 10) return 3;
  if (price < 1000) return 2;
  return 1; // very high-priced
}
