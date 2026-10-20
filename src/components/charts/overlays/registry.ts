/**
 * Drawing tools that klinecharts 10 does not ship. The toolbar used to call
 * `createOverlay()` with these names and nothing happened, because they were
 * never registered.
 */
import { registerOverlay, type OverlayTemplate, type Coordinate, type OverlayFigure } from 'klinecharts';

const LINE = '#2196F3';
const FILL = 'rgba(33, 150, 243, 0.12)';
const TEXT = '#E0E0E0';
const TEXT_BG = 'rgba(33, 150, 243, 0.85)';

const lineFig = (coordinates: Coordinate[], color = LINE, dashed = false): OverlayFigure => ({
  type: 'line',
  attrs: { coordinates },
  styles: { color, ...(dashed ? { style: 'dashed', dashedValue: [4, 4] } : {}) },
});

const polygonFig = (coordinates: Coordinate[]): OverlayFigure => ({
  type: 'polygon',
  attrs: { coordinates },
  styles: { style: 'stroke_fill', color: FILL, borderColor: LINE, borderSize: 1 },
});

const textFig = (x: number, y: number, text: string, opts: { align?: string; baseline?: string; bg?: boolean } = {}): OverlayFigure => ({
  type: 'text',
  ignoreEvent: true,
  attrs: { x, y, text, align: opts.align ?? 'center', baseline: opts.baseline ?? 'bottom' },
  styles: opts.bg
    ? { color: '#fff', backgroundColor: TEXT_BG, paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, borderRadius: 2, size: 11 }
    : { color: TEXT, backgroundColor: 'transparent', size: 11 },
});

/* ----------------------------------------------------------------------------
 * Shapes
 * ------------------------------------------------------------------------- */

const rect: OverlayTemplate = {
  name: 'rect',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return [];
    const [a, b] = coordinates;
    return [polygonFig([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }])];
  },
};

const circle: OverlayTemplate = {
  name: 'circle',
  totalStep: 3,
  needDefaultPointFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return [];
    const [c, e] = coordinates;
    const r = Math.hypot(e.x - c.x, e.y - c.y);
    return [{ type: 'circle', attrs: { x: c.x, y: c.y, r }, styles: { style: 'stroke_fill', color: FILL, borderColor: LINE, borderSize: 1 } }];
  },
};

const triangle: OverlayTemplate = {
  name: 'triangle',
  totalStep: 4,
  needDefaultPointFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return [];
    if (coordinates.length === 2) return [lineFig(coordinates)];
    return [polygonFig(coordinates.slice(0, 3))];
  },
};

const parallelogram: OverlayTemplate = {
  name: 'parallelogram',
  totalStep: 4,
  needDefaultPointFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return [];
    if (coordinates.length === 2) return [lineFig(coordinates)];
    const [a, b, c] = coordinates;
    const d = { x: a.x + (c.x - b.x), y: a.y + (c.y - b.y) };
    return [polygonFig([a, b, c, d])];
  },
};

/* ----------------------------------------------------------------------------
 * Measurement
 * ------------------------------------------------------------------------- */

type MeasureMode = 'both' | 'price' | 'time';

const formatDuration = (ms: number) => {
  const m = Math.round(Math.abs(ms) / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.round(h / 24)}d`;
};

const measureTemplate = (name: string, mode: MeasureMode): OverlayTemplate => ({
  name,
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultYAxisFigure: mode !== 'time',
  needDefaultXAxisFigure: mode !== 'price',
  createPointFigures: ({ coordinates, overlay, chart }) => {
    if (coordinates.length < 2) return [];
    const [a, b] = coordinates;
    const [pa, pb] = overlay.points;
    const parts: string[] = [];
    const up = (pb?.value ?? 0) >= (pa?.value ?? 0);
    if (mode !== 'time' && typeof pa?.value === 'number' && typeof pb?.value === 'number') {
      const precision = chart.getPrecision().price;
      const diff = pb.value - pa.value;
      const pct = pa.value ? (diff / pa.value) * 100 : 0;
      parts.push(`${diff >= 0 ? '+' : ''}${diff.toFixed(precision)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`);
    }
    if (mode !== 'price' && typeof pa?.dataIndex === 'number' && typeof pb?.dataIndex === 'number') {
      const bars = pb.dataIndex - pa.dataIndex;
      const span = typeof pa.timestamp === 'number' && typeof pb.timestamp === 'number' ? `, ${formatDuration(pb.timestamp - pa.timestamp)}` : '';
      parts.push(`${bars} bars${span}`);
    }
    const color = mode === 'time' ? LINE : up ? '#26a69a' : '#ef5350';
    const fill = mode === 'time' ? FILL : up ? 'rgba(38,166,154,0.15)' : 'rgba(239,83,80,0.15)';
    let box: Coordinate[];
    if (mode === 'price') box = [{ x: a.x, y: a.y }, { x: a.x + 6, y: a.y }, { x: a.x + 6, y: b.y }, { x: a.x, y: b.y }];
    else box = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
    const labelX = mode === 'price' ? a.x : (a.x + b.x) / 2;
    const labelY = Math.min(a.y, b.y) - 4;
    return [
      { type: 'polygon', attrs: { coordinates: box }, styles: { style: 'stroke_fill', color: fill, borderColor: color, borderSize: 1 } },
      lineFig([{ x: a.x, y: a.y }, { x: mode === 'price' ? a.x : b.x, y: b.y }], color, true),
      { ...textFig(labelX, labelY, parts.join('  ·  '), { bg: true }), styles: { color: '#fff', backgroundColor: color, paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, borderRadius: 2, size: 11 } },
    ];
  },
});

/* ----------------------------------------------------------------------------
 * Fibonacci extension (trend-based, 3 points: A start, B end, C retrace)
 * ------------------------------------------------------------------------- */

const FIB_EXT_LEVELS = [0, 0.618, 1, 1.272, 1.618, 2, 2.618];

const fibonacciExtension: OverlayTemplate = {
  name: 'fibonacciExtension',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, bounding, chart }) => {
    if (coordinates.length < 2) return [];
    const figs: OverlayFigure[] = [lineFig(coordinates.slice(0, Math.min(coordinates.length, 3)), LINE, true)];
    if (coordinates.length < 3) return figs;
    const [pa, pb, pc] = overlay.points;
    const [ca, cb, cc] = coordinates;
    if (typeof pa.value !== 'number' || typeof pb.value !== 'number' || typeof pc.value !== 'number') return figs;
    const precision = chart.getPrecision().price;
    // Pixel-per-price from the A->B leg (linear price axis).
    const pxPerValue = (cb.y - ca.y) / (pb.value - pa.value || 1);
    const move = pb.value - pa.value;
    FIB_EXT_LEVELS.forEach((lvl) => {
      const value = pc.value! + move * lvl;
      const y = cc.y + (value - pc.value!) * pxPerValue;
      figs.push(lineFig([{ x: cc.x, y }, { x: bounding.width, y }], 'rgba(255, 152, 0, 0.9)'));
      figs.push(textFig(cc.x + 4, y, `${lvl} (${value.toFixed(precision)})`, { align: 'left' }));
    });
    return figs;
  },
};

/* ----------------------------------------------------------------------------
 * Regression trend channel (fits closes between the two clicked bars)
 * ------------------------------------------------------------------------- */

const regression: OverlayTemplate = {
  name: 'regression',
  totalStep: 3,
  needDefaultPointFigure: true,
  createPointFigures: ({ coordinates, overlay, chart }) => {
    if (coordinates.length < 2) return [];
    const [pa, pb] = overlay.points;
    if (typeof pa.dataIndex !== 'number' || typeof pb.dataIndex !== 'number') return [lineFig(coordinates)];
    const from = Math.max(Math.min(pa.dataIndex, pb.dataIndex), 0);
    const list = chart.getDataList();
    const to = Math.min(Math.max(pa.dataIndex, pb.dataIndex), list.length - 1);
    const n = to - from + 1;
    if (n < 3) return [lineFig(coordinates)];
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const y = list[from + i].close;
      sx += i; sy += y; sxx += i * i; sxy += i * y;
    }
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - slope * sx) / n;
    let dev = 0;
    for (let i = 0; i < n; i++) dev += (list[from + i].close - (intercept + slope * i)) ** 2;
    const sd = Math.sqrt(dev / n);
    const toPixel = (idx: number, value: number) => chart.convertToPixel({ dataIndex: idx, value }, { paneId: overlay.paneId }) as Coordinate;
    const line = (offset: number) => [toPixel(from, intercept + offset), toPixel(to, intercept + slope * (n - 1) + offset)];
    return [
      lineFig(line(0), LINE),
      lineFig(line(2 * sd), 'rgba(33,150,243,0.6)', true),
      lineFig(line(-2 * sd), 'rgba(33,150,243,0.6)', true),
    ];
  },
};

/* ----------------------------------------------------------------------------
 * Labeled multi-point patterns (ABCD, XABCD, Elliott waves, H&S)
 * ------------------------------------------------------------------------- */

const pattern = (name: string, labels: string[], fillTriangles = false): OverlayTemplate => ({
  name,
  totalStep: labels.length + 1,
  needDefaultPointFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return [];
    const figs: OverlayFigure[] = [];
    if (fillTriangles) {
      for (let i = 0; i + 2 < coordinates.length; i += 2) figs.push(polygonFig(coordinates.slice(i, i + 3)));
    }
    figs.push(lineFig(coordinates));
    coordinates.forEach((c, i) => {
      if (!labels[i]) return;
      const prev = coordinates[i - 1] ?? coordinates[i + 1];
      const isTop = !prev || c.y <= prev.y;
      figs.push(textFig(c.x, isTop ? c.y - 6 : c.y + 6, labels[i], { baseline: isTop ? 'bottom' : 'top', bg: true }));
    });
    return figs;
  },
});

const TEMPLATES: OverlayTemplate[] = [
  rect,
  circle,
  triangle,
  parallelogram,
  measureTemplate('measure', 'both'),
  measureTemplate('measurePrice', 'price'),
  measureTemplate('measureRange', 'time'),
  fibonacciExtension,
  regression,
  pattern('abcd', ['A', 'B', 'C', 'D']),
  pattern('xabcd', ['X', 'A', 'B', 'C', 'D'], true),
  pattern('threeWaves', ['0', '1', '2', '3']),
  pattern('fiveWaves', ['0', '1', '2', '3', '4', '5']),
  pattern('eightWaves', ['0', '1', '2', '3', '4', '5', 'A', 'B', 'C']),
  pattern('headAndShoulders', ['', 'LS', '', 'H', '', 'RS', '']),
];

let registered = false;

export function registerKoinoniaOverlays(): void {
  if (registered) return;
  registered = true;
  TEMPLATES.forEach((t) => registerOverlay(t));
}

export const CUSTOM_OVERLAY_NAMES = TEMPLATES.map((t) => t.name);
