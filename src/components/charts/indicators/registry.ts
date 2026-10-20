/**
 * Registers every indicator the panel offers as its own KLineChart template,
 * backed by the verified math in ./calc.
 *
 * Why not the library built-ins: in klinecharts 10 "SMA" is a weighted
 * smoothing average (needs two params, so `SMA(20)` produced NaN after one
 * bar), RSI uses simple sums instead of Wilder smoothing, SAR expects percent
 * inputs, and many panel entries (VWAP, Ichimoku, Supertrend, Keltner, MFI...)
 * have no built-in at all and were previously drawn as a different indicator.
 */
import { registerIndicator, type KLineData } from 'klinecharts';
import * as C from './calc';

type FigureType = 'line' | 'bar';
interface FigureDef {
  key: string;
  title: string;
  type?: FigureType;
}

interface Template {
  name: string;
  shortName: string;
  overlay: boolean;
  /** Plot on the price scale (overlays) so precision follows the price. */
  calcParams: number[];
  figures: FigureDef[];
  precision?: number;
  minValue?: number;
  maxValue?: number;
  compute: (b: C.Bars, p: number[]) => Record<string, C.Series>;
}

const T: Template[] = [
  // ---- Moving averages & trend overlays -----------------------------------
  { name: 'KF_SMA', shortName: 'SMA', overlay: true, calcParams: [20], figures: [{ key: 'v', title: 'SMA: ' }], compute: (b, [p]) => ({ v: C.sma(b.close, p) }) },
  { name: 'KF_EMA', shortName: 'EMA', overlay: true, calcParams: [20], figures: [{ key: 'v', title: 'EMA: ' }], compute: (b, [p]) => ({ v: C.ema(b.close, p) }) },
  { name: 'KF_WMA', shortName: 'WMA', overlay: true, calcParams: [20], figures: [{ key: 'v', title: 'WMA: ' }], compute: (b, [p]) => ({ v: C.wma(b.close, p) }) },
  { name: 'KF_DEMA', shortName: 'DEMA', overlay: true, calcParams: [20], figures: [{ key: 'v', title: 'DEMA: ' }], compute: (b, [p]) => ({ v: C.dema(b.close, p) }) },
  { name: 'KF_TEMA', shortName: 'TEMA', overlay: true, calcParams: [20], figures: [{ key: 'v', title: 'TEMA: ' }], compute: (b, [p]) => ({ v: C.tema(b.close, p) }) },
  { name: 'KF_VWMA', shortName: 'VWMA', overlay: true, calcParams: [20], figures: [{ key: 'v', title: 'VWMA: ' }], compute: (b, [p]) => ({ v: C.vwma(b, p) }) },
  {
    name: 'KF_VWAP', shortName: 'VWAP', overlay: true, calcParams: [1],
    figures: [{ key: 'v', title: 'VWAP: ' }, { key: 'up', title: '+σ: ' }, { key: 'dn', title: '-σ: ' }],
    compute: (b, [m]) => { const r = C.vwap(b, m); return { v: r.value, up: r.upper, dn: r.lower }; },
  },
  { name: 'KF_SAR', shortName: 'SAR', overlay: true, calcParams: [0.02, 0.02, 0.2], figures: [{ key: 'v', title: 'SAR: ' }], compute: (b, [s, i, m]) => ({ v: C.parabolicSar(b, s, i, m) }) },
  {
    name: 'KF_SUPERTREND', shortName: 'Supertrend', overlay: true, calcParams: [10, 3],
    figures: [{ key: 'up', title: 'Up: ' }, { key: 'dn', title: 'Down: ' }],
    compute: (b, [p, m]) => { const r = C.supertrend(b, p, m); return { up: r.up, dn: r.down }; },
  },
  {
    name: 'KF_ICHIMOKU', shortName: 'Ichimoku', overlay: true, calcParams: [9, 26, 52, 26],
    figures: [
      { key: 'tenkan', title: 'Conv: ' }, { key: 'kijun', title: 'Base: ' },
      { key: 'spanA', title: 'Span A: ' }, { key: 'spanB', title: 'Span B: ' }, { key: 'chikou', title: 'Lag: ' },
    ],
    compute: (b, [c, k, s, d]) => ({ ...C.ichimoku(b, c, k, s, d) }),
  },
  {
    name: 'KF_BB', shortName: 'BB', overlay: true, calcParams: [20, 2],
    figures: [{ key: 'up', title: 'Upper: ' }, { key: 'mid', title: 'Basis: ' }, { key: 'dn', title: 'Lower: ' }],
    compute: (b, [p, m]) => { const r = C.bollinger(b.close, p, m); return { up: r.upper, mid: r.mid, dn: r.lower }; },
  },
  {
    name: 'KF_KC', shortName: 'KC', overlay: true, calcParams: [20, 1.5, 10],
    figures: [{ key: 'up', title: 'Upper: ' }, { key: 'mid', title: 'Basis: ' }, { key: 'dn', title: 'Lower: ' }],
    compute: (b, [p, m, a]) => { const r = C.keltner(b, p, m, a); return { up: r.upper, mid: r.mid, dn: r.lower }; },
  },
  {
    name: 'KF_DC', shortName: 'DC', overlay: true, calcParams: [20],
    figures: [{ key: 'up', title: 'Upper: ' }, { key: 'mid', title: 'Basis: ' }, { key: 'dn', title: 'Lower: ' }],
    compute: (b, [p]) => { const r = C.donchian(b, p); return { up: r.upper, mid: r.mid, dn: r.lower }; },
  },
  { name: 'KF_LINREG', shortName: 'LinReg', overlay: true, calcParams: [14], figures: [{ key: 'v', title: 'LR: ' }], compute: (b, [p]) => ({ v: C.linearRegression(b.close, p) }) },
  {
    name: 'KF_PIVOTS', shortName: 'Pivots', overlay: true, calcParams: [],
    figures: [{ key: 'r2', title: 'R2: ' }, { key: 'r1', title: 'R1: ' }, { key: 'p', title: 'P: ' }, { key: 's1', title: 'S1: ' }, { key: 's2', title: 'S2: ' }],
    compute: (b) => ({ ...C.floorPivots(b) }),
  },
  {
    name: 'KF_SWING', shortName: 'Swing H/L', overlay: true, calcParams: [5],
    figures: [{ key: 'hi', title: 'Swing High: ' }, { key: 'lo', title: 'Swing Low: ' }],
    compute: (b, [s]) => { const r = C.swingLevels(b, s); return { hi: r.high, lo: r.low }; },
  },
  { name: 'KF_ZIGZAG', shortName: 'ZigZag', overlay: true, calcParams: [5], figures: [{ key: 'v', title: 'ZigZag: ' }], compute: (b, [d]) => ({ v: C.zigzag(b, d) }) },

  // ---- Momentum ------------------------------------------------------------
  { name: 'KF_RSI', shortName: 'RSI', overlay: false, calcParams: [14], precision: 2, minValue: 0, maxValue: 100, figures: [{ key: 'v', title: 'RSI: ' }], compute: (b, [p]) => ({ v: C.rsiSeries(b.close, p) }) },
  {
    name: 'KF_MACD', shortName: 'MACD', overlay: false, calcParams: [12, 26, 9], precision: 4,
    figures: [{ key: 'line', title: 'MACD: ' }, { key: 'signal', title: 'Signal: ' }, { key: 'hist', title: 'Hist: ', type: 'bar' }],
    compute: (b, [f, s, g]) => ({ ...C.macd(b.close, f, s, g) }),
  },
  {
    name: 'KF_STOCH', shortName: 'Stoch', overlay: false, calcParams: [14, 3, 3], precision: 2, minValue: 0, maxValue: 100,
    figures: [{ key: 'k', title: '%K: ' }, { key: 'd', title: '%D: ' }],
    compute: (b, [k, s, d]) => ({ ...C.stochastic(b, k, s, d) }),
  },
  {
    name: 'KF_STOCHRSI', shortName: 'StochRSI', overlay: false, calcParams: [14, 14, 3, 3], precision: 2, minValue: 0, maxValue: 100,
    figures: [{ key: 'k', title: '%K: ' }, { key: 'd', title: '%D: ' }],
    compute: (b, [r, s, k, d]) => ({ ...C.stochRsi(b.close, r, s, k, d) }),
  },
  { name: 'KF_WR', shortName: '%R', overlay: false, calcParams: [14], precision: 2, minValue: -100, maxValue: 0, figures: [{ key: 'v', title: '%R: ' }], compute: (b, [p]) => ({ v: C.williamsR(b, p) }) },
  { name: 'KF_CCI', shortName: 'CCI', overlay: false, calcParams: [20], precision: 2, figures: [{ key: 'v', title: 'CCI: ' }], compute: (b, [p]) => ({ v: C.cci(b, p) }) },
  { name: 'KF_MFI', shortName: 'MFI', overlay: false, calcParams: [14], precision: 2, minValue: 0, maxValue: 100, figures: [{ key: 'v', title: 'MFI: ' }], compute: (b, [p]) => ({ v: C.mfi(b, p) }) },
  { name: 'KF_ROC', shortName: 'ROC', overlay: false, calcParams: [10], precision: 2, figures: [{ key: 'v', title: 'ROC %: ' }], compute: (b, [p]) => ({ v: C.roc(b.close, p) }) },
  { name: 'KF_MOM', shortName: 'Mom', overlay: false, calcParams: [10], precision: 2, figures: [{ key: 'v', title: 'Mom: ' }], compute: (b, [p]) => ({ v: C.momentum(b.close, p) }) },
  { name: 'KF_UO', shortName: 'UO', overlay: false, calcParams: [7, 14, 28], precision: 2, minValue: 0, maxValue: 100, figures: [{ key: 'v', title: 'UO: ' }], compute: (b, [s, m, l]) => ({ v: C.ultimateOscillator(b, s, m, l) }) },
  { name: 'KF_AO', shortName: 'AO', overlay: false, calcParams: [], precision: 4, figures: [{ key: 'v', title: 'AO: ', type: 'bar' }], compute: (b) => ({ v: C.awesomeOscillator(b) }) },
  {
    name: 'KF_TSI', shortName: 'TSI', overlay: false, calcParams: [25, 13, 13], precision: 2,
    figures: [{ key: 'v', title: 'TSI: ' }, { key: 'signal', title: 'Signal: ' }],
    compute: (b, [l, s, g]) => { const r = C.tsi(b.close, l, s, g); return { v: r.value, signal: r.signal }; },
  },
  { name: 'KF_CMO', shortName: 'CMO', overlay: false, calcParams: [14], precision: 2, minValue: -100, maxValue: 100, figures: [{ key: 'v', title: 'CMO: ' }], compute: (b, [p]) => ({ v: C.cmo(b.close, p) }) },
  { name: 'KF_TRIX', shortName: 'TRIX', overlay: false, calcParams: [18], precision: 3, figures: [{ key: 'v', title: 'TRIX: ' }], compute: (b, [p]) => ({ v: C.trix(b.close, p) }) },

  // ---- Volatility ------------------------------------------------------------
  { name: 'KF_ATR', shortName: 'ATR', overlay: false, calcParams: [14], precision: 4, figures: [{ key: 'v', title: 'ATR: ' }], compute: (b, [p]) => ({ v: C.atr(b, p) }) },
  { name: 'KF_NATR', shortName: 'NATR', overlay: false, calcParams: [14], precision: 2, figures: [{ key: 'v', title: 'NATR %: ' }], compute: (b, [p]) => ({ v: C.natr(b, p) }) },
  { name: 'KF_STDDEV', shortName: 'StdDev', overlay: false, calcParams: [20], precision: 4, figures: [{ key: 'v', title: 'StdDev: ' }], compute: (b, [p]) => ({ v: C.stdev(b.close, p) }) },
  { name: 'KF_BBW', shortName: 'BBW', overlay: false, calcParams: [20, 2], precision: 2, figures: [{ key: 'v', title: 'BBW %: ' }], compute: (b, [p, m]) => ({ v: C.bbWidth(b.close, p, m) }) },
  { name: 'KF_BBPB', shortName: '%B', overlay: false, calcParams: [20, 2], precision: 3, figures: [{ key: 'v', title: '%B: ' }], compute: (b, [p, m]) => ({ v: C.bbPercentB(b.close, p, m) }) },
  { name: 'KF_CHV', shortName: 'Chaikin Vol', overlay: false, calcParams: [10, 10], precision: 2, figures: [{ key: 'v', title: 'CHV %: ' }], compute: (b, [e, r]) => ({ v: C.chaikinVolatility(b, e, r) }) },

  // ---- Volume ----------------------------------------------------------------
  { name: 'KF_OBV', shortName: 'OBV', overlay: false, calcParams: [], precision: 0, figures: [{ key: 'v', title: 'OBV: ' }], compute: (b) => ({ v: C.obv(b) }) },
  { name: 'KF_AD', shortName: 'A/D', overlay: false, calcParams: [], precision: 0, figures: [{ key: 'v', title: 'A/D: ' }], compute: (b) => ({ v: C.accumulationDistribution(b) }) },
  { name: 'KF_CMF', shortName: 'CMF', overlay: false, calcParams: [20], precision: 3, figures: [{ key: 'v', title: 'CMF: ' }], compute: (b, [p]) => ({ v: C.chaikinMoneyFlow(b, p) }) },
  { name: 'KF_VROC', shortName: 'VROC', overlay: false, calcParams: [14], precision: 2, figures: [{ key: 'v', title: 'VROC %: ' }], compute: (b, [p]) => ({ v: C.volumeRoc(b, p) }) },
  { name: 'KF_PVT', shortName: 'PVT', overlay: false, calcParams: [], precision: 0, figures: [{ key: 'v', title: 'PVT: ' }], compute: (b) => ({ v: C.volumePriceTrend(b) }) },
  { name: 'KF_EOM', shortName: 'EOM', overlay: false, calcParams: [14], precision: 4, figures: [{ key: 'v', title: 'EOM: ' }], compute: (b, [p]) => ({ v: C.easeOfMovement(b, p) }) },
  { name: 'KF_NVI', shortName: 'NVI', overlay: false, calcParams: [], precision: 2, figures: [{ key: 'v', title: 'NVI: ' }], compute: (b) => ({ v: C.volumeIndex(b, 'negative') }) },
  { name: 'KF_PVI', shortName: 'PVI', overlay: false, calcParams: [], precision: 2, figures: [{ key: 'v', title: 'PVI: ' }], compute: (b) => ({ v: C.volumeIndex(b, 'positive') }) },

  // ---- Statistical & oscillators ------------------------------------------
  { name: 'KF_LRSLOPE', shortName: 'LR Slope', overlay: false, calcParams: [14], precision: 4, figures: [{ key: 'v', title: 'Slope: ' }], compute: (b, [p]) => ({ v: C.linearRegressionSlope(b.close, p) }) },
  { name: 'KF_R2', shortName: 'R²', overlay: false, calcParams: [20], precision: 3, minValue: 0, maxValue: 1, figures: [{ key: 'v', title: 'R²: ' }], compute: (b, [p]) => ({ v: C.rSquared(b.close, p) }) },
  { name: 'KF_DPO', shortName: 'DPO', overlay: false, calcParams: [20], precision: 4, figures: [{ key: 'v', title: 'DPO: ' }], compute: (b, [p]) => ({ v: C.dpo(b.close, p) }) },
  {
    name: 'KF_KST', shortName: 'KST', overlay: false, calcParams: [9], precision: 2,
    figures: [{ key: 'v', title: 'KST: ' }, { key: 'signal', title: 'Signal: ' }],
    compute: (b, [s]) => { const r = C.kst(b.close, s); return { v: r.value, signal: r.signal }; },
  },
  {
    name: 'KF_PPO', shortName: 'PPO', overlay: false, calcParams: [12, 26, 9], precision: 3,
    figures: [{ key: 'v', title: 'PPO: ' }, { key: 'signal', title: 'Signal: ' }, { key: 'hist', title: 'Hist: ', type: 'bar' }],
    compute: (b, [f, s, g]) => { const r = C.ppo(b.close, f, s, g); return { v: r.value, signal: r.signal, hist: r.hist }; },
  },
  { name: 'KF_APO', shortName: 'APO', overlay: false, calcParams: [10, 21], precision: 4, figures: [{ key: 'v', title: 'APO: ' }], compute: (b, [f, s]) => ({ v: C.apo(b.close, f, s) }) },
  {
    name: 'KF_AROON', shortName: 'Aroon', overlay: false, calcParams: [25], precision: 2, minValue: 0, maxValue: 100,
    figures: [{ key: 'up', title: 'Up: ' }, { key: 'dn', title: 'Down: ' }],
    compute: (b, [p]) => { const r = C.aroon(b, p); return { up: r.up, dn: r.down }; },
  },
  { name: 'KF_AROONOSC', shortName: 'Aroon Osc', overlay: false, calcParams: [25], precision: 2, minValue: -100, maxValue: 100, figures: [{ key: 'v', title: 'Osc: ' }], compute: (b, [p]) => ({ v: C.aroon(b, p).osc }) },
  {
    name: 'KF_DMI', shortName: 'DMI', overlay: false, calcParams: [14], precision: 2,
    figures: [{ key: 'pdi', title: '+DI: ' }, { key: 'mdi', title: '-DI: ' }, { key: 'adx', title: 'ADX: ' }],
    compute: (b, [p]) => ({ ...C.adx(b, p) }),
  },
  { name: 'KF_ADX', shortName: 'ADX', overlay: false, calcParams: [14], precision: 2, figures: [{ key: 'v', title: 'ADX: ' }], compute: (b, [p]) => ({ v: C.adx(b, p).adx }) },
];

const UP = '#26a69a';
const DOWN = '#ef5350';

let registered = false;

/** Register all templates once per page load. Safe to call repeatedly. */
export function registerKoinoniaIndicators(): void {
  if (registered) return;
  registered = true;
  for (const t of T) {
    registerIndicator<Record<string, number | undefined>, number>({
      name: t.name,
      shortName: t.shortName,
      series: (t.overlay ? 'price' : 'normal') as never,
      precision: t.precision ?? 2,
      calcParams: t.calcParams,
      minValue: t.minValue ?? null,
      maxValue: t.maxValue ?? null,
      figures: t.figures.map((f) =>
        f.type === 'bar'
          ? {
              key: f.key,
              title: f.title,
              type: 'bar',
              baseValue: 0,
              styles: ({ data }: { data: { current?: Record<string, number | undefined> | null } }) => {
                const v = data.current?.[f.key] ?? 0;
                const color = v >= 0 ? UP : DOWN;
                return { style: 'fill', color, borderColor: color } as never;
              },
            }
          : { key: f.key, title: f.title, type: 'line' },
      ) as never,
      calc: (dataList: KLineData[], indicator) => {
        const result = t.compute(C.toBars(dataList), indicator.calcParams as number[]);
        const keys = Object.keys(result);
        return dataList.map((_, i) => {
          const row: Record<string, number | undefined> = {};
          for (const k of keys) {
            const v = result[k][i];
            if (Number.isFinite(v)) row[k] = v;
          }
          return row;
        });
      },
    });
  }
}

/* ----------------------------------------------------------------------------
 * Panel id  ->  chart indicator
 * ------------------------------------------------------------------------- */

export interface ResolvedIndicator {
  /** Registered template name. */
  name: string;
  calcParams?: number[];
  overlay: boolean;
  /** Pane id for separate-pane indicators (same family shares a pane). */
  paneId?: string;
}

const PANE_FAMILY: Record<string, string> = {
  KF_RSI: 'rsi_pane', KF_MACD: 'macd_pane', KF_STOCH: 'stoch_pane', KF_STOCHRSI: 'stochrsi_pane',
  KF_ATR: 'atr_pane', KF_CCI: 'cci_pane', KF_ROC: 'roc_pane', KF_MOM: 'mom_pane',
};

/** Parse "SMA(20)" / "BB(20,2)" into numbers. */
const parseParams = (id: string): number[] | undefined => {
  const m = id.match(/\(([^)]*)\)/);
  if (!m) return undefined;
  const nums = m[1].split(',').map((s) => parseFloat(s.trim()));
  return nums.every(Number.isFinite) ? nums : undefined;
};

/** Prefix-matched panel ids. Order matters (BBW/BB%B before BB). */
const PREFIX: Array<[string, string]> = [
  ['SMA', 'KF_SMA'], ['EMA', 'KF_EMA'], ['WMA', 'KF_WMA'], ['DEMA', 'KF_DEMA'], ['TEMA', 'KF_TEMA'], ['VWMA', 'KF_VWMA'],
  ['BBW', 'KF_BBW'], ['BB%B', 'KF_BBPB'], ['BB', 'KF_BB'], ['KC', 'KF_KC'], ['DC', 'KF_DC'],
  ['RSI', 'KF_RSI'], ['CCI', 'KF_CCI'], ['MFI', 'KF_MFI'], ['ROC', 'KF_ROC'], ['Momentum', 'KF_MOM'], ['CMO', 'KF_CMO'],
  ['NATR', 'KF_NATR'], ['ATR', 'KF_ATR'], ['StdDev', 'KF_STDDEV'], ['CMF', 'KF_CMF'], ['VROC', 'KF_VROC'],
  ['LinearRegSlope', 'KF_LRSLOPE'], ['LinearReg', 'KF_LINREG'], ['ADX', 'KF_ADX'], ['MACD', 'KF_MACD'],
];

const EXACT: Record<string, string> = {
  SAR: 'KF_SAR', PSAR: 'KF_SAR', Supertrend: 'KF_SUPERTREND', Ichimoku: 'KF_ICHIMOKU', VWAP: 'KF_VWAP',
  Stochastic: 'KF_STOCH', StochRSI: 'KF_STOCHRSI', 'Williams%R': 'KF_WR', UO: 'KF_UO', AO: 'KF_AO', TSI: 'KF_TSI',
  TRIX: 'KF_TRIX', Chaikin: 'KF_CHV', OBV: 'KF_OBV', AD: 'KF_AD', PVT: 'KF_PVT', VPT: 'KF_PVT', EOM: 'KF_EOM',
  NVI: 'KF_NVI', PVI: 'KF_PVI', R2: 'KF_R2', DPO: 'KF_DPO', KST: 'KF_KST', PPO: 'KF_PPO', PO: 'KF_APO',
  AROON: 'KF_AROON', AroonOsc: 'KF_AROONOSC', DMI: 'KF_DMI', Pivot: 'KF_PIVOTS', PivotHiLo: 'KF_SWING', ZigZag: 'KF_ZIGZAG',
};

const BY_NAME = new Map(T.map((t) => [t.name, t]));

/** Panel ids that are intentionally unsupported (need data we don't have). */
export const RETIRED_INDICATOR_IDS = new Set(['Correlation', 'Beta', 'FibRetrace']);

export function resolveIndicator(panelId: string): ResolvedIndicator | null {
  if (panelId === 'Volume') return { name: 'VOL', overlay: false, paneId: 'vol_pane' };
  let name = EXACT[panelId];
  if (!name) name = PREFIX.find(([p]) => panelId.startsWith(p))?.[1] ?? '';
  const t = name ? BY_NAME.get(name) : undefined;
  if (!t) return null;
  const params = parseParams(panelId);
  // A parenthesised id may give fewer params than the template (e.g. KC(20,1.5)); keep defaults for the rest.
  const calcParams = params ? t.calcParams.map((d, i) => params[i] ?? d) : undefined;
  return {
    name: t.name,
    calcParams: calcParams && calcParams.length ? calcParams : undefined,
    overlay: t.overlay,
    paneId: t.overlay ? undefined : PANE_FAMILY[t.name] ?? `${t.name.toLowerCase()}_pane`,
  };
}

/** Line count of a template; used to size style arrays. */
export const figureCount = (name: string): number => BY_NAME.get(name)?.figures.filter((f) => f.type !== 'bar').length ?? 1;

export const INDICATOR_TEMPLATES = T;
