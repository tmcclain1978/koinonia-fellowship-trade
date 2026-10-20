/**
 * One overlay that draws every options level in pixel space from a single
 * anchor (the latest candle). Figures ignore mouse events so they never block
 * candles, drawings or order lines.
 */
import { registerOverlay, type OverlayFigure, type OverlayTemplate } from "klinecharts";

export const OPTIONS_LEVELS = "koinoniaOptionsLevels";
export const OPTIONS_GROUP = "options-levels";

export interface LevelLine {
  price: number;
  label: string;
  color: string;
  dashed?: boolean;
}

export interface OptionsLevelsData {
  band?: { upper: number; lower: number; label: string };
  lines: LevelLine[];
  /** Net gamma per strike, drawn as bars from the right edge. */
  profile?: Array<{ strike: number; value: number }>;
  tags?: Array<{ price: number; label: string; color: string }>;
}

const PROFILE_MAX_PX = 110;
const PROFILE_BAR_PX = 4;
const BAND_FILL = "rgba(168, 85, 247, 0.08)";
const BAND_EDGE = "rgba(168, 85, 247, 0.7)";

const label = (x: number, y: number, text: string, bg: string, align: "left" | "right" | "center" = "left"): OverlayFigure => ({
  type: "text",
  ignoreEvent: true,
  attrs: { x, y, text, align, baseline: "middle" },
  styles: { color: "#ffffff", backgroundColor: bg, size: 10, paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, borderRadius: 2 },
});

const template: OverlayTemplate<OptionsLevelsData> = {
  name: OPTIONS_LEVELS,
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, bounding, yAxis, overlay }) => {
    const d = overlay.extendData;
    if (!d || !yAxis) return [];
    const y = (v: number) => yAxis.convertToPixel(v);
    const inView = (py: number) => py >= 0 && py <= bounding.height;
    const figs: OverlayFigure[] = [];
    const anchorX = Math.min(Math.max(coordinates[0]?.x ?? bounding.width * 0.8, 0), bounding.width);

    // Labels for levels just outside the visible range are pinned to the
    // top/bottom edge with an arrow, so off-screen levels aren't silently missing.
    let topSlot = 0;
    let bottomSlot = 0;
    // Top-edge labels go top-right: the top-left holds the chart's price and
    // indicator readout, which grows with every indicator.
    const edgeLabel = (text: string, bg: string, above: boolean) => {
      if (above) figs.push(label(bounding.width - PROFILE_MAX_PX - 8, 10 + 16 * topSlot++, `▲ ${text}`, bg, "right"));
      else figs.push(label(4, bounding.height - 10 - 16 * bottomSlot++, `▼ ${text}`, bg));
    };
    const levelLine = (price: number, text: string, color: string, dashed?: boolean) => {
      const py = y(price);
      if (!inView(py)) {
        edgeLabel(text, color, py < 0);
        return;
      }
      figs.push({
        type: "line",
        ignoreEvent: true,
        attrs: { coordinates: [{ x: 0, y: py }, { x: bounding.width, y: py }] },
        styles: { color, size: 1, style: dashed ? "dashed" : "solid", dashedValue: [2, 3] },
      });
      figs.push(label(4, py, text, color));
    };

    // Gamma profile first, so lines and labels draw on top. Scaled to the
    // strikes on screen with a square root, so one huge wall doesn't shrink
    // every other bar to nothing.
    if (d.profile?.length) {
      const visible = d.profile.map((p) => ({ ...p, py: y(p.strike) })).filter((p) => inView(p.py));
      const max = Math.max(0, ...visible.map((p) => Math.abs(p.value)));
      if (max > 0) {
        for (const p of visible) {
          const w = Math.max(3, Math.sqrt(Math.abs(p.value) / max) * PROFILE_MAX_PX);
          figs.push({
            type: "rect",
            ignoreEvent: true,
            attrs: { x: bounding.width - w, y: p.py - PROFILE_BAR_PX / 2, width: w, height: PROFILE_BAR_PX },
            styles: { style: "fill", color: p.value >= 0 ? "rgba(22, 163, 74, 0.6)" : "rgba(220, 38, 38, 0.6)" },
          });
        }
      }
    }

    if (d.band) {
      const yu = y(d.band.upper);
      const yl = y(d.band.lower);
      const top = Math.max(Math.min(yu, bounding.height), 0);
      const bottom = Math.max(Math.min(yl, bounding.height), 0);
      if (bottom > top) {
        figs.push({
          type: "polygon",
          ignoreEvent: true,
          attrs: { coordinates: [{ x: anchorX, y: top }, { x: bounding.width, y: top }, { x: bounding.width, y: bottom }, { x: anchorX, y: bottom }] },
          styles: { style: "fill", color: BAND_FILL },
        });
      }
      levelLine(d.band.upper, `EM high ${d.band.upper.toFixed(2)} · ${d.band.label}`, BAND_EDGE, true);
      levelLine(d.band.lower, `EM low ${d.band.lower.toFixed(2)}`, BAND_EDGE, true);
    }

    for (const l of d.lines) levelLine(l.price, l.label, l.color, l.dashed);

    for (const t of d.tags ?? []) {
      const py = y(t.price);
      if (!inView(py)) continue;
      figs.push(label(bounding.width - PROFILE_MAX_PX - 6, py, t.label, t.color, "right"));
    }
    return figs;
  },
};

let registered = false;
export function registerOptionsLevelsOverlay() {
  if (registered) return;
  registered = true;
  registerOverlay(template);
}
