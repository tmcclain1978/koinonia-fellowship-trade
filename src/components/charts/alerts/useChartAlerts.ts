/**
 * Alerts for the charted symbol: loads them, keeps them live (realtime), and
 * draws level and line alerts. Level alerts can be dragged to a new price.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Chart, OverlayCreate } from "klinecharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { alertChartShape, describeAlert, isArmed, movedLevelType, toChartAlert, type ChartAlert, type NewAlert } from "./chartAlerts";
import { ALERT_LINE, ALERT_TREND, ALERTS_GROUP, registerAlertLineOverlay, type AlertLineData } from "./alertLineOverlay";

registerAlertLineOverlay();

const ALERT_COLOR = "#f59e0b";
const overlayId = (id: string) => `alert_${id.replace(/[^a-z0-9]+/gi, "_")}`;

/* ----------------------------------------------------------------------------
 * Data access
 * ------------------------------------------------------------------------- */

export async function loadAlerts(symbol: string): Promise<ChartAlert[]> {
  const { data, error } = await supabase
    .from("price_alerts")
    .select("*")
    .eq("symbol", symbol.toUpperCase())
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => toChartAlert(r as unknown as Record<string, unknown>));
}

export async function createAlert(a: NewAlert): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) throw new Error("Sign in to create alerts.");
  const { error } = await supabase.from("price_alerts").insert({
    user_id: auth.user.id,
    symbol: a.symbol,
    alert_type: a.alert_type,
    target_value: a.target_value,
    condition: (a.condition ?? null) as Json,
    frequency: a.frequency,
    cooldown_minutes: a.cooldown_minutes,
    notify_email: a.notify_email,
    notes: a.notes,
    is_active: true,
    is_triggered: false,
  });
  if (error) throw error;
}

export async function deleteAlert(id: string): Promise<void> {
  const { error } = await supabase.from("price_alerts").delete().eq("id", id);
  if (error) throw error;
}

/** Re-arm a fired one-time alert. */
export async function rearmAlert(id: string): Promise<void> {
  const { error } = await supabase
    .from("price_alerts")
    .update({ is_triggered: false, triggered_at: null, trigger_message: null, last_checked_at: new Date().toISOString(), last_price: null })
    .eq("id", id);
  if (error) throw error;
}

export async function moveLevelAlert(a: ChartAlert, level: number, lastPrice: number | null): Promise<void> {
  const { error } = await supabase
    .from("price_alerts")
    .update({
      target_value: Math.round(level * 10000) / 10000,
      alert_type: movedLevelType(level, lastPrice, a.alert_type),
      // Only look at prices from now on, not the minutes before the move.
      last_checked_at: new Date().toISOString(),
      is_triggered: false,
      triggered_at: a.frequency === "repeat" ? a.triggered_at : null,
    })
    .eq("id", a.id);
  if (error) throw error;
}

/** Ask the server to check this user's alerts now (it limits how often). */
export async function checkAlertsNow(): Promise<{ checked: number; triggered: number; skipped: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke("evaluate-alerts", { body: { manual: true } });
  if (error) throw error;
  return data;
}

/* ----------------------------------------------------------------------------
 * Hook
 * ------------------------------------------------------------------------- */

interface Options {
  chart: Chart | null;
  chartGen: number;
  symbol: string;
  visible: boolean;
  lastPrice: number | null;
}

export function useChartAlerts({ chart, chartGen, symbol, visible, lastPrice }: Options) {
  const [alerts, setAlerts] = useState<ChartAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;
  const lastPriceRef = useRef(lastPrice);
  lastPriceRef.current = lastPrice;
  const chartRef = useRef<Chart | null>(null);
  const applied = useRef(new Map<string, string>());

  const seq = useRef(0);
  const refresh = useCallback(async () => {
    const s = ++seq.current;
    try {
      const list = await loadAlerts(symbol);
      if (s !== seq.current) return;
      setAlerts(list);
      setError(null);
    } catch (e) {
      if (s !== seq.current) return;
      setError(`Couldn't load alerts: ${(e as Error)?.message ?? e}`);
    }
  }, [symbol]);

  useEffect(() => {
    setAlerts([]);
    void refresh();
    // Live updates (triggered, edited elsewhere). Filtered client-side by symbol.
    const channel = supabase
      .channel(`chart-alerts-${symbol}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "price_alerts" }, (payload) => {
        const row = (payload.new ?? payload.old) as { symbol?: string } | null;
        if (!row?.symbol || row.symbol.toUpperCase() === symbol.toUpperCase()) void refresh();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [symbol, refresh]);

  const withSaving = useCallback(async (id: string, fn: () => Promise<void>, ok?: string) => {
    setSaving((s) => new Set(s).add(id));
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error((e as Error)?.message ?? String(e));
    } finally {
      setSaving((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      void refresh();
    }
  }, [refresh]);

  const add = useCallback(async (a: NewAlert) => {
    try {
      await createAlert(a);
      toast.success(`Alert set: ${a.symbol} ${describeAlert(a)}`, { description: "Checked every minute, even with this page closed." });
      void refresh();
      return true;
    } catch (e) {
      toast.error((e as Error)?.message ?? String(e));
      return false;
    }
  }, [refresh]);

  const remove = useCallback((id: string) => withSaving(id, () => deleteAlert(id), "Alert deleted"), [withSaving]);
  const rearm = useCallback((id: string) => withSaving(id, () => rearmAlert(id), "Alert re-armed"), [withSaving]);

  /* ---- drawing ------------------------------------------------------- */

  const findAlert = (oid: string) => alertsRef.current.find((a) => overlayId(a.id) === oid);
  const handlers = useRef<Partial<OverlayCreate>>({});
  handlers.current = {
    onPressedMoveEnd: ({ overlay }) => {
      const a = findAlert(overlay.id);
      const value = overlay.points[0]?.value;
      if (!a || typeof value !== "number") return false;
      if (Math.abs(value - a.target_value) < 1e-9) return false;
      const level = Math.round(value * 10000) / 10000;
      void withSaving(a.id, () => moveLevelAlert(a, level, lastPriceRef.current), `Alert moved to ${level >= 1 ? level.toFixed(2) : level}`);
      return false;
    },
    onClick: ({ overlay, figure }) => {
      const a = findAlert(overlay.id);
      if (a && figure?.key === "delete") void remove(a.id);
      return false;
    },
    onRightClick: () => true, // keep klinecharts from deleting the line without touching the alert
  } as Partial<OverlayCreate>;

  useEffect(() => {
    if (chartRef.current !== chart) {
      chartRef.current = chart;
      applied.current.clear();
    }
    if (!chart) return;
    if (!visible) {
      chart.removeOverlay({ groupId: ALERTS_GROUP });
      applied.current.clear();
      return;
    }
    const desired = new Map<string, { name: string; points: Array<{ timestamp?: number; value: number }>; data: AlertLineData; lock: boolean }>();
    for (const a of alerts) {
      const shape = alertChartShape(a);
      if (!shape) continue;
      const armed = isArmed(a);
      const isSaving = saving.has(a.id);
      const label = `${describeAlert(a)}${!armed ? " · fired" : a.frequency === "repeat" ? " · repeats" : ""}`;
      if (shape.type === "level") {
        desired.set(overlayId(a.id), {
          name: ALERT_LINE,
          points: [{ value: shape.price }],
          lock: isSaving || !armed,
          data: { label, color: ALERT_COLOR, shape: "level", done: !armed, pending: isSaving },
        });
      } else {
        const [p1, p2] = shape.line.points;
        desired.set(overlayId(a.id), {
          name: ALERT_TREND,
          points: [{ timestamp: p1.t, value: p1.v }, { timestamp: p2.t, value: p2.v }],
          lock: true,
          data: { label, color: ALERT_COLOR, shape: shape.line.kind === "horizontal" ? "level" : shape.line.kind, done: !armed, pending: isSaving },
        });
      }
    }
    for (const id of Array.from(applied.current.keys())) {
      if (!desired.has(id)) {
        chart.removeOverlay({ id });
        applied.current.delete(id);
      }
    }
    desired.forEach((d, id) => {
      const state = JSON.stringify(d);
      if (applied.current.get(id) === state) return;
      const exists = applied.current.has(id) || (chart.getOverlays({ id }) ?? []).length > 0;
      if (exists) chart.overrideOverlay({ id, points: d.points, extendData: d.data, lock: d.lock });
      else {
        chart.createOverlay({
          name: d.name,
          id,
          groupId: ALERTS_GROUP,
          points: d.points,
          extendData: d.data,
          lock: d.lock,
          zLevel: 9,
          onPressedMoveEnd: (e) => handlers.current.onPressedMoveEnd!(e),
          onClick: (e) => handlers.current.onClick!(e),
          onRightClick: (e) => handlers.current.onRightClick!(e),
        } as OverlayCreate);
      }
      applied.current.set(id, state);
    });
  }, [chart, chartGen, visible, alerts, saving]);

  return { alerts, error, refresh, add, remove, rearm };
}
