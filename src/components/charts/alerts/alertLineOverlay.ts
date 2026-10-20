/**
 * Alert on the chart. A level alert is a dashed horizontal line with a bell
 * label that can be dragged to a new price; a line alert follows the drawn
 * line (segment, ray or extended). Both have a ✕ to delete the alert.
 */
import { registerOverlay, type OverlayFigure, type OverlayTemplate } from "klinecharts";

/** Level alerts (one point). */
export const ALERT_LINE = "koinoniaAlertLine";
/** Line alerts (two points). */
export const ALERT_TREND = "koinoniaAlertTrend";
export const ALERTS_GROUP = "alerts";

export interface AlertLineData {
  label: string;
  color: string;
  /** level = horizontal through the first point; else the line through both points. */
  shape: "level" | "segment" | "ray" | "extended";
  /** Fired one-time alert: drawn faded. */
  done?: boolean;
  pending?: boolean;
}

const RIGHT_PAD = 8;
const CHAR_PX = 6.2;
const estimateWidth = (text: string) => text.length * CHAR_PX + 12;
const textStyle = (bg: string) => ({
  color: "#ffffff",
  backgroundColor: bg,
  borderRadius: 2,
  paddingLeft: 6,
  paddingRight: 6,
  paddingTop: 3,
  paddingBottom: 3,
  size: 11,
  family: "Arial, sans-serif",
  weight: "bold",
});

/** Extend the segment a→b to the chart edges (pixel space = what's drawn). */
export function extendLine(a: { x: number; y: number }, b: { x: number; y: number }, width: number, kind: "segment" | "ray" | "extended") {
  if (kind === "segment" || a.x === b.x) return [a, b];
  const slope = (b.y - a.y) / (b.x - a.x);
  const at = (x: number) => ({ x, y: a.y + slope * (x - a.x) });
  const forward = b.x > a.x ? width : 0;
  if (kind === "ray") return [a, at(forward)];
  return [at(0), at(width)];
}

const alertLine: OverlayTemplate<AlertLineData> = {
  name: ALERT_LINE,
  // Steps = points + 1; a one-point overlay is "finished" (and draggable) at 2.
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    const d = overlay.extendData;
    const c0 = coordinates[0];
    if (!d || !c0) return [];
    const color = d.pending ? "#6b7280" : d.done ? "#a3a3a3" : d.color;
    const line: OverlayFigure = { type: "line", attrs: { coordinates: [] }, styles: { color, size: 1, style: "dashed", dashedValue: [4, 3] } };
    const text = `🔔 ${d.label}${d.pending ? " · saving…" : ""}`;
    const w = estimateWidth(text);
    const DELETE_W = 22;
    // Everything is right-aligned: [✕][label] ending at `right`.
    let right = bounding.width - RIGHT_PAD;
    let labelY = c0.y;
    if (d.shape === "level" || !coordinates[1]) {
      line.attrs = { coordinates: [{ x: 0, y: c0.y }, { x: bounding.width, y: c0.y }] };
    } else {
      const pts = extendLine(c0, coordinates[1], bounding.width, d.shape);
      line.attrs = { coordinates: pts };
      // Just past the right-hand end of the line, kept inside the pane.
      const end = pts[0].x > pts[1].x ? pts[0] : pts[1];
      right = Math.min(end.x + 6 + DELETE_W + w, bounding.width - RIGHT_PAD);
      labelY = Math.min(Math.max(end.y, 10), bounding.height - 10);
    }
    const figures: OverlayFigure[] = [line, { key: "label", type: "text", attrs: { x: right, y: labelY, text, align: "right", baseline: "middle" }, styles: textStyle(color) }];
    if (!d.pending) {
      figures.push({ key: "delete", type: "text", attrs: { x: right - w - 4, y: labelY, text: "✕", align: "right", baseline: "middle" }, styles: textStyle("#374151") });
    }
    return figures;
  },
};

let registered = false;
export function registerAlertLineOverlay() {
  if (registered) return;
  registered = true;
  registerOverlay(alertLine);
  registerOverlay({ ...alertLine, name: ALERT_TREND, totalStep: 3 });
}
