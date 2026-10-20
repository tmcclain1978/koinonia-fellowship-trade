/**
 * Saved drawing-tool objects, per symbol. Stored by time and price (not bar
 * index), so a trend line drawn on the 5-minute chart shows up in the same
 * place on the 1-hour chart.
 */
import type { Chart, Overlay, OverlayCreate } from "klinecharts";
import { cloudLoad, cloudSave } from "./chartCloud";

/** Group for user drawings, separate from signal lines, session dividers, AI zones etc. */
export const USER_DRAWINGS_GROUP = "user-drawings";

const LOCAL_KEY = "koinonia-chart-drawings-v1";
const MAX_PER_SYMBOL = 200;
/** Overlay step value once drawing is finished (klinecharts OVERLAY_DRAW_STEP_FINISHED). */
const DRAW_FINISHED = -1;

export interface SavedPoint {
  timestamp: number;
  value: number;
}

export interface SavedDrawing {
  name: string;
  points: SavedPoint[];
  styles?: unknown;
  extendData?: unknown;
  lock?: boolean;
}

interface SymbolEntry {
  drawings: SavedDrawing[];
  updatedAt: number;
}

const cloudKey = (symbol: string) => `drawings:${symbol.toUpperCase()}`;

/* ----------------------------------------------------------------------------
 * Local storage
 * ------------------------------------------------------------------------- */

function readAll(): Record<string, SymbolEntry> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, SymbolEntry>) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
  } catch {
    /* storage full: cloud copy (if any) still saved */
  }
}

/** Keep only well-formed drawings (guards against bad local/cloud data). */
export function sanitizeDrawings(list: unknown): SavedDrawing[] {
  if (!Array.isArray(list)) return [];
  const out: SavedDrawing[] = [];
  for (const d of list) {
    if (!d || typeof d !== "object" || typeof (d as SavedDrawing).name !== "string") continue;
    const pts = (d as SavedDrawing).points;
    if (!Array.isArray(pts) || pts.length === 0) continue;
    if (!pts.every((p) => p && Number.isFinite(p.timestamp) && Number.isFinite(p.value))) continue;
    const { name, styles, extendData, lock } = d as SavedDrawing;
    out.push({ name, points: pts.map((p) => ({ timestamp: p.timestamp, value: p.value })), styles, extendData, lock: !!lock });
    if (out.length >= MAX_PER_SYMBOL) break;
  }
  return out;
}

export function getSavedDrawings(symbol: string): SavedDrawing[] {
  return sanitizeDrawings(readAll()[symbol.toUpperCase()]?.drawings);
}

export function saveDrawings(symbol: string, drawings: SavedDrawing[], updatedAt = Date.now()): void {
  const sym = symbol.toUpperCase();
  const clean = sanitizeDrawings(drawings);
  const all = readAll();
  if (clean.length === 0) delete all[sym];
  else all[sym] = { drawings: clean, updatedAt };
  writeAll(all);
  cloudSave(cloudKey(sym), clean, updatedAt);
}

/** Cloud copy for this symbol if it's newer than the local one (and saves it locally). */
export async function fetchNewerCloudDrawings(symbol: string): Promise<SavedDrawing[] | null> {
  const sym = symbol.toUpperCase();
  const remote = await cloudLoad<SavedDrawing[]>(cloudKey(sym));
  if (!remote) return null;
  const local = readAll()[sym];
  if (local && local.updatedAt >= remote.updatedAt) return null;
  const clean = sanitizeDrawings(remote.value);
  const all = readAll();
  if (clean.length) all[sym] = { drawings: clean, updatedAt: remote.updatedAt };
  else delete all[sym];
  writeAll(all);
  return clean;
}

/* ----------------------------------------------------------------------------
 * Chart wiring
 * ------------------------------------------------------------------------- */

// Charts being torn down: their overlays disappear, but that is not the user
// deleting drawings, so nothing is saved.
const retired = new WeakSet<Chart>();
export const retireChart = (chart: Chart | null) => {
  if (chart) retired.add(chart);
};

/** Read the finished user drawings off a chart. */
export function snapshotDrawings(chart: Chart): SavedDrawing[] {
  const overlays = (chart.getOverlays({ groupId: USER_DRAWINGS_GROUP }) ?? []) as Overlay[];
  return overlays
    .filter((o) => o.currentStep === DRAW_FINISHED)
    .map((o) => ({
      name: o.name,
      points: o.points.map((p) => ({ timestamp: p.timestamp as number, value: p.value as number })),
      styles: o.styles ?? undefined,
      extendData: o.extendData ?? undefined,
      lock: o.lock,
    }))
    .filter((d) => d.points.every((p) => Number.isFinite(p.timestamp) && Number.isFinite(p.value)));
}

const pendingPersist = new WeakMap<Chart, boolean>();

function persistSoon(chart: Chart, symbol: string) {
  if (retired.has(chart) || pendingPersist.get(chart)) return;
  pendingPersist.set(chart, true);
  // After the current event finishes (e.g. a restore that removes and re-adds overlays).
  queueMicrotask(() => {
    pendingPersist.delete(chart);
    if (retired.has(chart)) return;
    saveDrawings(symbol, snapshotDrawings(chart));
  });
}

/** Event handlers that keep the saved copy in step with the chart. */
export function drawingHandlers(symbol: string): Partial<OverlayCreate> {
  const save = ({ chart }: { chart: Chart }) => {
    persistSoon(chart, symbol);
    return false;
  };
  return { onDrawEnd: save, onPressedMoveEnd: save, onRemoved: save } as Partial<OverlayCreate>;
}

/** Start a new drawing with the given tool. */
export function startDrawing(chart: Chart, tool: string, symbol: string) {
  chart.createOverlay({ name: tool, groupId: USER_DRAWINGS_GROUP, ...drawingHandlers(symbol) } as OverlayCreate);
}

/** Replace the chart's user drawings with the saved ones for this symbol. */
export function restoreDrawings(chart: Chart, symbol: string, drawings = getSavedDrawings(symbol)) {
  // Not a user deletion: skip saving while swapping.
  pendingPersist.set(chart, true);
  try {
    chart.removeOverlay({ groupId: USER_DRAWINGS_GROUP });
    for (const d of drawings) {
      chart.createOverlay({
        name: d.name,
        groupId: USER_DRAWINGS_GROUP,
        points: d.points,
        styles: d.styles as OverlayCreate["styles"],
        extendData: d.extendData,
        lock: d.lock,
        ...drawingHandlers(symbol),
      } as OverlayCreate);
    }
  } finally {
    queueMicrotask(() => pendingPersist.delete(chart));
  }
}

/** Remove every user drawing for this symbol (signal lines etc. are untouched). */
export function clearDrawings(chart: Chart, symbol: string) {
  pendingPersist.set(chart, true);
  chart.removeOverlay({ groupId: USER_DRAWINGS_GROUP });
  queueMicrotask(() => pendingPersist.delete(chart));
  saveDrawings(symbol, []);
}
