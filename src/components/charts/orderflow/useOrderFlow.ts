import { useEffect, useRef, useState } from "react";
import type { Chart } from "klinecharts";
import { schwabFeed } from "@/lib/marketData";
import type { OrderFlowPrefs } from "../state/chartPrefs";
import { refreshOrderFlowLayers, syncOrderFlowLayers } from "./layers";
import { acquireOrderFlow, setOrderFlowFeed, type OrderFlowRecorder } from "./recorder";

setOrderFlowFeed(schwabFeed);

export const orderFlowWanted = (p: OrderFlowPrefs) => p.heatmap || p.bubbles || p.footprint || p.delta || p.cvd || p.dom;

interface Args {
  chart: Chart | null;
  /** Changes when the chart is rebuilt (layers must be re-added). */
  chartGen: number;
  symbol: string;
  prefs: OrderFlowPrefs;
  /** false in replay mode: order flow is live only. */
  visible: boolean;
  dark: boolean;
}

/**
 * Record order flow for the chart's symbol while any order flow view is on,
 * and keep the chart layers in step with the settings. Live data never
 * re-renders the chart component: the layers redraw on the canvas, and the
 * ladder/popover subscribe to the recorder themselves.
 */
export function useOrderFlow({ chart, chartGen, symbol, prefs, visible, dark }: Args): OrderFlowRecorder | null {
  const active = visible && orderFlowWanted(prefs);
  const [rec, setRec] = useState<OrderFlowRecorder | null>(null);
  // Read in the cleanup: false there means the user turned order flow off
  // (stop now); true means the chart closed or changed symbol (keep a while).
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!active) {
      setRec(null);
      return;
    }
    const handle = acquireOrderFlow(symbol);
    if (!handle) return;
    setRec(handle.rec);
    return () => {
      handle.release(!activeRef.current);
    };
  }, [active, symbol]);

  // Redraw the layers as data comes in.
  useEffect(() => {
    if (!rec || !chart) return;
    return rec.onChange(() => refreshOrderFlowLayers(chart));
  }, [rec, chart]);

  useEffect(() => {
    if (!chart) return;
    syncOrderFlowLayers(
      chart,
      active && rec
        ? { symbol: rec.symbol, heatmap: prefs.heatmap, bubbles: prefs.bubbles, footprint: prefs.footprint, delta: prefs.delta, cvd: prefs.cvd, bigPrint: prefs.bigPrint, dark }
        : null,
    );
  }, [chart, chartGen, active, rec, prefs.heatmap, prefs.bubbles, prefs.footprint, prefs.delta, prefs.cvd, prefs.bigPrint, dark]);

  return rec;
}

/** Re-render a component when the recorder has new data (throttled by the recorder). */
export function useRecorderTick(rec: OrderFlowRecorder | null): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!rec) return;
    setV(rec.version);
    return rec.onChange(() => setV(rec.version));
  }, [rec]);
  return v;
}
