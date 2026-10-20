/**
 * Chart line for an order or position: a horizontal line with a label on the
 * right ("BUY LMT 100 @ 190.25"), an optional ✕ to cancel, and for positions
 * the live P&L. Order lines can be dragged up/down unless locked.
 */
import { registerOverlay, type OverlayFigure, type OverlayTemplate } from "klinecharts";

export const TRADE_LINE = "koinoniaTradeLine";
export const TRADING_GROUP = "trading";

export interface TradeLineData {
  kind: "order" | "position";
  label: string;
  color: string;
  dashed: boolean;
  cancelable: boolean;
  locked: boolean;
  /** Request in flight: shown dimmed with "sending…". */
  pending?: boolean;
  pnlText?: string;
  pnlColor?: string;
}

const LABEL_FONT_SIZE = 11;
const CHAR_PX = 6.6; // average glyph width at 11px, for placing the ✕ next to the label
const RIGHT_PAD = 8;

const textStyle = (bg: string) => ({
  color: "#ffffff",
  backgroundColor: bg,
  borderRadius: 2,
  paddingLeft: 6,
  paddingRight: 6,
  paddingTop: 3,
  paddingBottom: 3,
  size: LABEL_FONT_SIZE,
  family: "Arial, sans-serif",
  weight: "bold",
});

const estimateWidth = (text: string) => text.length * CHAR_PX + 12;

const tradeLine: OverlayTemplate<TradeLineData> = {
  name: TRADE_LINE,
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    const c = coordinates[0];
    const d = overlay.extendData;
    if (!c || !d) return [];
    const y = c.y;
    const color = d.pending ? "#6b7280" : d.color;
    const figures: OverlayFigure[] = [
      {
        type: "line",
        attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] },
        styles: { color, size: d.kind === "position" ? 2 : 1, style: d.dashed ? "dashed" : "solid", dashedValue: [6, 4] },
      },
    ];
    const label = d.pending ? `${d.label}  · sending…` : d.locked && d.kind === "order" ? `🔒 ${d.label}` : d.label;
    let x = bounding.width - RIGHT_PAD;
    figures.push({ key: "label", type: "text", attrs: { x, y, text: label, align: "right", baseline: "middle" }, styles: textStyle(color) });
    x -= estimateWidth(label) + 4;
    if (d.pnlText) {
      figures.push({ key: "pnl", type: "text", attrs: { x, y, text: d.pnlText, align: "right", baseline: "middle" }, styles: textStyle(d.pnlColor ?? color) });
      x -= estimateWidth(d.pnlText) + 4;
    }
    if (d.cancelable && !d.pending) {
      figures.push({ key: "cancel", type: "text", attrs: { x, y, text: "✕", align: "right", baseline: "middle" }, styles: textStyle("#374151") });
    }
    return figures;
  },
};

let registered = false;
export function registerTradeLineOverlay() {
  if (registered) return;
  registered = true;
  registerOverlay(tradeLine);
}
